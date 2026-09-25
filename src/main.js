'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, WebContentsView, ipcMain, screen, shell, Menu, Tray, nativeImage, session, dialog, safeStorage, Notification } = require('electron');
const { ConfigStore, LIMITS, REGION_LIMITS, DEFAULT_GROUP, AUTOMATIONS_ACTION_SCHEMA, STUDIO_ACTION_SCHEMA } = require('./config');
const { ObsBridge, parseWindowChoice } = require('./obs');
const { TavernBridge } = require('./tavern');
const { AutomationsServer } = require('./automations');
const { YouTubeUploader } = require('./youtube');
const parkingGeometry = require('./parking');

const APP_NAME = 'Coffee Pub Studio';

// Git revision recorded by scripts/write-build-info.js (absent in a bare checkout).
function readBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8'));
  } catch (err) {
    return { commit: 'unknown', branch: '', dirty: false };
  }
}
const BUILD_INFO = readBuildInfo();
const APP_VERSION = require('../package.json').version;
const REVISION = `v${APP_VERSION} (${BUILD_INFO.commit}${BUILD_INFO.dirty ? '+' : ''})`;
// Storage partition of the default session group ("Main"); other groups get
// their own partition, see partitionFor().
const PARTITION = 'persist:coffeepub';
const DOCK_WIDTH = parkingGeometry.STRIP; // collapsed dock pill width
const DOCK_EXPANDED = 260; // expanded dock pill width
const BAR_HEIGHT = 28; // the app's own bar at the top of each window (cropped out in OBS)

// Session group -> storage partition. "Main" keeps the original partition so
// existing logins survive; other groups get their own.
function partitionFor(view) {
  const group = String(view.session || DEFAULT_GROUP);
  if (group === DEFAULT_GROUP) return PARTITION;
  const slug = group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
  return `persist:group-${slug}`;
}

// Selector candidates to try in order: the text as typed, then, when it has
// no selector punctuation, the same words read as a list of class names
// ("secondary-bar-item secondary-bar-item-progressbar" -> ".secondary-bar-item.secondary-bar-item-progressbar").
function selectorCandidates(text) {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  const candidates = [trimmed];
  if (!/[.#\[\]>:+~*,="']/.test(trimmed)) {
    candidates.push(
      trimmed
        .split(/\s+/)
        .map((c) => `.${c}`)
        .join(''),
    );
  }
  return candidates;
}

app.setName(APP_NAME);

// Keep the view windows rendering at full rate even when they are not focused
// or are behind other windows. OBS captures whatever the window paints, so
// throttled rendering would show up as a stuttering source.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Let Foundry play audio without a click first.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Play audio from the app's own process rather than Chromium's audio helper
// process: macOS window capture (ScreenCaptureKit) attributes sound to the
// process that owns the captured window, so audio from a helper never
// reaches the OBS source.
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');

// The app was called "Coffee Pub Browser" before v0.1.8. On the first launch
// under the new name, carry the settings over from the old folder. The OBS
// password cannot come along: the keychain entry it was encrypted with is
// named after the app, so it has to be entered once more.
function migrateLegacyUserData() {
  const legacyDir = path.join(app.getPath('appData'), 'Coffee Pub Browser');
  const userData = app.getPath('userData');
  const target = path.join(userData, 'config.json');
  const source = path.join(legacyDir, 'config.json');
  try {
    if (fs.existsSync(target) || !fs.existsSync(source)) return;
    fs.mkdirSync(userData, { recursive: true });
    fs.copyFileSync(source, target);
    console.log(`Migrated settings from ${legacyDir}`);
  } catch (err) {
    console.warn('Could not migrate settings from the old app folder:', err.message);
  }
}
migrateLegacyUserData();

const configStore = new ConfigStore(path.join(app.getPath('userData'), 'config.json'));

/** @type {Map<string, BrowserWindow>} */
const viewWindows = new Map();
/** @type {Map<string, WebContentsView>} */
const pageViews = new Map();
let parking = false; // true while collapse/expand move windows programmatically

// Shown in a window that has no URL configured yet.
const PLACEHOLDER_URL =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>No URL</title></head>' +
    '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#1a1410;color:#a8998a;font:16px -apple-system,Helvetica,Arial,sans-serif;text-align:center">' +
    '<div><div style="font-size:40px">&#9749;</div>No URL set for this window.<br>Enter one in the Control Panel (Cmd+0).</div>' +
    '</body></html>',
  );
/** @type {BrowserWindow | null} */
let controlWindow = null;
/** @type {Tray | null} */
let tray = null;
let quitting = false;
// Parked windows: id -> { x, y, thumb } to restore from the dock.
const parked = new Map();
let collapsed = false;
/** @type {BrowserWindow | null} */
let dockWindow = null;
/** @type {Map<number, BrowserWindow>} display id -> cover strip */
const coverStrips = new Map();
let dockExpanded = false;

// ---------------------------------------------------------------------------
// OBS password (kept out of config.json, encrypted with the OS keychain)
// ---------------------------------------------------------------------------

const OBS_SECRET_PATH = path.join(app.getPath('userData'), 'obs-secret.bin');
const TAVERN_SECRET_PATH = path.join(app.getPath('userData'), 'tavern-secret.bin');

function readSecret(file) {
  try {
    const raw = fs.readFileSync(file);
    if (raw.length === 0) return '';
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(raw);
    return raw.toString('utf8');
  } catch (err) {
    return '';
  }
}

function writeSecret(file, secret) {
  const text = typeof secret === 'string' ? secret : '';
  if (!text) {
    fs.rmSync(file, { force: true });
    return;
  }
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  fs.writeFileSync(file, data);
}

const readObsPassword = () => readSecret(OBS_SECRET_PATH);
const writeObsPassword = (password) => writeSecret(OBS_SECRET_PATH, password);

// ---------------------------------------------------------------------------
// Activity log (Connections card, Configuration tab) -- a shared, in-memory record
// of state transitions and errors from OBS, Tavern, and Automations, so
// troubleshooting a bad connection doesn't mean reading main-process console
// output. Not persisted -- resets on restart.
// ---------------------------------------------------------------------------
const ACTIVITY_LOG_LIMIT = 100;
let activityLog = []; // newest first: {at, source, event, level}

function logActivity(source, event, level = 'info') {
  activityLog.unshift({ at: Date.now(), source, event, level });
  activityLog.length = Math.min(activityLog.length, ACTIVITY_LOG_LIMIT);
  broadcastStatus();
}

const obs = new ObsBridge({
  getSettings: () => configStore.get().obs,
  getPassword: readObsPassword,
});
let lastObsState = null;
obs.on('status', (s) => {
  if (s.state !== lastObsState) {
    lastObsState = s.state;
    logActivity('OBS', s.message || s.state, s.state === 'error' ? 'error' : 'info');
  } else {
    broadcastStatus();
  }
});
obs.on('connected', () => {
  syncObs().catch(() => {});
  syncTavern().catch(() => {});
});

// ---------------------------------------------------------------------------
// YouTube (uploads a finished recording -- see uploadToYouTube in
// runAutomationAction, and src/youtube.js for why this is OAuth's device
// flow rather than a loopback redirect). clientSecret and the refresh token
// share one encrypted file, same keychain-backed pattern as the OBS/Tavern
// passwords above; clientId is not secret and lives in config.json like
// obs.host does.
// ---------------------------------------------------------------------------

const YOUTUBE_SECRET_PATH = path.join(app.getPath('userData'), 'youtube-secret.bin');

function readYoutubeSecret() {
  const raw = readSecret(YOUTUBE_SECRET_PATH);
  if (!raw) return { clientSecret: '', refreshToken: '' };
  try {
    const parsed = JSON.parse(raw);
    return {
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      uploadSession: parsed.uploadSession && typeof parsed.uploadSession === 'object' ? parsed.uploadSession : undefined,
    };
  } catch (err) {
    return { clientSecret: '', refreshToken: '' };
  }
}

function writeYoutubeSecret(patch) {
  writeSecret(YOUTUBE_SECRET_PATH, JSON.stringify({ ...readYoutubeSecret(), ...patch }));
}

const youtube = new YouTubeUploader({
  getCredentials: () => {
    const { clientId } = configStore.get().youtube;
    const { clientSecret, refreshToken } = readYoutubeSecret();
    return { clientId, clientSecret, refreshToken };
  },
  saveRefreshToken: (refreshToken) => writeYoutubeSecret({ refreshToken }),
  // An in-flight upload's session URL is effectively a bearer capability
  // (whoever has it can push bytes into that upload), so it lives in the
  // same encrypted blob as the refresh token rather than a plain file.
  loadUploadSession: () => readYoutubeSecret().uploadSession || null,
  saveUploadSession: (uploadSession) => writeYoutubeSecret({ uploadSession: uploadSession || undefined }),
});
// Set only while a device-flow connect is in progress, so a control-panel
// reload mid-flow can still show the code the user needs to enter --
// cleared on success, failure, or starting a fresh connect.
let youtubeConnectState = null;
// ruleSetId -> 0-100, only while that rule set's uploadToYouTube step is
// actively uploading -- lets the Automations tab show a live progress bar
// on the specific card doing the upload. See runYouTubeUpload.
const youtubeUploadProgress = new Map();

// ---------------------------------------------------------------------------
// Coffee Pub Tavern (the party's voice and video; each player an OBS source)
// ---------------------------------------------------------------------------

const tavern = new TavernBridge({
  getSettings: () => configStore.get().tavern,
  getPassword: () => readSecret(TAVERN_SECRET_PATH),
});
// What the last sync found in OBS, shown on the Tavern tab.
let tavernSync = { at: 0, inputs: [], created: [], updated: [], renamed: [], missing: [], note: '' };
let lastTavernState = null;
tavern.on('status', (s) => {
  if (s.state !== lastTavernState) {
    lastTavernState = s.state;
    logActivity('Tavern', s.message || s.state, s.state === 'error' ? 'error' : 'info');
  } else {
    broadcastStatus();
  }
});
tavern.on('connected', () => syncTavern().catch(() => {}));
tavern.on('party', () => syncTavern().catch(() => {}));

function tavernSourceName(user, kind = 'player', n = 1) {
  const type = kind === 'character' ? 'Character' : 'Participant';
  const name = n > 1 ? `${user.displayName} ${n}` : user.displayName;
  return `${type}: ${name} (CP Studio)`;
}

// A room's profile gates which source kinds it offers: 'roleplaying' (the
// default, for a room with no profile) offers both, 'participants' offers
// only the Participant source, 'characters' offers only the Character source.
// This is the same room the Tavern tab's picker is showing -- a purely
// manual choice, "this room is for this OBS session," never overridden by
// wherever the admin happens to be live -- everyone is a member of Lobby as
// well as their own room, so picking "the first room this user belongs to"
// would silently resolve to Lobby's profile instead of the room actually
// on screen.
function currentTavernRoom() {
  const t = configStore.get().tavern;
  return tavern.room(t.space || 'lobby');
}
function allowsPlayer(room) {
  return !room || room.profile !== 'characters';
}
function allowsCharacter(room) {
  return !room || room.profile !== 'participants';
}

// The Participant source: video, or the player image when the camera is off,
// with the talking border, overlay images and name plate as set on the
// Tavern. Audio always on and routed to the OBS mixer.
function tavernPlayerSource(user) {
  const t = configStore.get().tavern;
  return { url: tavern.viewUrl(user, { kind: 'player' }), width: t.playerWidth, height: t.playerHeight, audio: true };
}

// The Character source: the character image with talking and muted images on
// top; transparent until they talk or mute when there is no character image.
function tavernCharacterSource(user) {
  const t = configStore.get().tavern;
  return { url: tavern.viewUrl(user, { kind: 'character' }), width: t.characterWidth, height: t.characterHeight, audio: false };
}

// Make OBS match the published players: one Browser Source each, named after
// the player, pointed at their view link at the chosen size.
// Sources already hidden because their room stopped offering that kind, so
// syncTavern does not re-issue the same OBS visibility call every poll.
const gatedHidden = new Set();

async function syncTavern() {
  const report = { at: Date.now(), inputs: [], created: [], updated: [], renamed: [], missing: [], hidden: [], note: '' };
  const t = configStore.get().tavern;
  const entries = Object.entries(t.players);
  if (!tavern.connected) {
    report.note = 'Not signed in to the Tavern.';
    tavernSync = report;
    broadcastStatus();
    return report;
  }
  if (!obs.connected) {
    report.note = 'OBS is not connected; sources are created when it is.';
    report.missing = entries.map(([, e]) => e.source);
    tavernSync = report;
    broadcastStatus();
    return report;
  }
  const inputs = await obs.browserInputs();
  report.inputs = inputs.map((i) => i.name);
  const players = { ...t.players };
  let changedConfig = false;
  const ourNames = () => new Set(Object.values(players).flatMap((p) => [p.source, p.characterSource].filter(Boolean)));
  // One OBS Browser Source: create it, re-point it, follow a rename.
  const ensure = async (key, field, kind, user, wanted) => {
    const entry = players[key];
    let name = entry[field];
    if (!name) return;
    const preferred = tavernSourceName(user, kind);
    if (name !== preferred && !inputs.some((i) => i.name === preferred) && !ourNames().has(preferred)) {
      if (inputs.some((i) => i.name === name)) {
        await obs.renameInput(name, preferred);
        report.renamed.push(`${name} -> ${preferred}`);
      }
      const input = inputs.find((i) => i.name === name);
      if (input) input.name = preferred;
      name = preferred;
      players[key] = { ...entry, [field]: name };
      changedConfig = true;
    }
    const existing = inputs.find((i) => i.name === name);
    if (!existing) {
      await obs.createBrowserInput(name, wanted);
      inputs.push({ name, ...wanted, rerouteAudio: wanted.audio });
      report.created.push(name);
    } else if (existing.url !== wanted.url || existing.width !== wanted.width || existing.height !== wanted.height || existing.rerouteAudio !== wanted.audio) {
      await obs.setBrowserInput(name, wanted);
      Object.assign(existing, wanted, { rerouteAudio: wanted.audio });
      report.updated.push(name);
    }
  };
  // A room's profile may have changed since a source was published (or the
  // server may not have sent a profile at all before this existed): hide
  // whichever source the room no longer offers instead of maintaining it,
  // and re-show it (if its tick is still on) once the room allows it again.
  // The tick and the source name are left alone either way -- this is not
  // the user unpublishing, so nothing should look "removed" or lose its
  // OBS placement; Delete from OBS is the only thing that deletes it.
  const gateSource = async (key, kind, name, ticked, allowed) => {
    if (!name) return;
    if (!allowed) {
      if (gatedHidden.has(name)) return;
      await obs.setSourceVisible(name, false).catch(() => {});
      gatedHidden.add(name);
      report.hidden.push(`${name}: this room offers ${kind === 'character' ? 'Participant' : 'Character'} sources only`);
      return;
    }
    if (gatedHidden.delete(name) && ticked) await obs.setSourceVisible(name, true).catch(() => {});
  };
  const room = currentTavernRoom();
  for (const [key] of entries) {
    const user = tavern.party.find((u) => u.key === key);
    if (!user) continue; // deleted on the server; the card shows it
    const entry = players[key];
    await gateSource(key, 'player', entry.source, entry.player, allowsPlayer(room));
    await gateSource(key, 'character', entry.characterSource, entry.character, allowsCharacter(room));
    if (entry.source && allowsPlayer(room)) await ensure(key, 'source', 'player', user, tavernPlayerSource(user));
    if (entry.characterSource && allowsCharacter(room)) await ensure(key, 'characterSource', 'character', user, tavernCharacterSource(user));
  }
  // Two independent, separately-triggered mutes for someone who isn't part
  // of the current conversation right now -- checked per source, not just
  // per user, since a user's actual room and Enable Asides can each change
  // independently of the other. Neither hides or dims the source -- Tavern
  // owns everything visual now (its own page is what's actually on screen);
  // Studio only ever mutes.
  //
  // - Private Conversation (`ephemeral && private`): muted for as long as
  //   they're live in it. Unconditional -- a privacy guarantee, not a
  //   production preference, so it does not depend on Enable Asides and
  //   cannot be left accidentally off by an unrelated setting. What's
  //   actually shown for them while private is Tavern's call, per our
  //   agreement -- Studio no longer hides the source itself.
  // - Live, but in a different room than wherever the admin/GM currently
  //   is (`tavern.activeRoom`, only meaningful while an admin actually is
  //   online -- with none online there's no "current conversation" to be
  //   aside from, so nobody is treated as aside in that case, same bug in
  //   a new form otherwise): muted, since they're genuinely live elsewhere
  //   with real audio that would otherwise bleed into the stream. This is
  //   NOT the dropdown's manually-picked room (`room`, used only for
  //   Participant/Character gating above) -- when the GM steps into a
  //   pulled-aside room, THAT becomes the live conversation, and everyone
  //   else (including anyone left behind in the room the dropdown still
  //   shows) is who should mute, not the people the GM actually pulled
  //   aside. Only while Enable Asides is on, and only for someone actually
  //   elsewhere -- ordinary room navigation by the operator (the dropdown)
  //   must never mute anyone, that was the original bug.
  // Offline is deliberately NOT muted here -- there's no live audio track
  // from a source that isn't even in the Tavern call, so muting it would be
  // a no-op with nothing to suppress.
  const adminOnline = tavern.party.some((u) => u.role === 'admin' && u.online);
  {
    for (const [key, entry] of entries) {
      const user = tavern.party.find((u) => u.key === key);
      if (!user) continue;
      const stepRoom = user.online ? tavern.rooms.find((r) => r.id === user.online.room) : null;
      const inPrivateRoom = Boolean(stepRoom && stepRoom.ephemeral && stepRoom.private);
      const offline = !inPrivateRoom && !user.online;
      const steppedOutToAside = t.followAdmin && adminOnline && !inPrivateRoom && !offline && user.online.room !== tavern.activeRoom;
      const apply = async (name) => {
        // A source its room's profile doesn't offer is hidden entirely by
        // the gating pass above; leave that alone rather than layer a
        // second, unrelated reason for hiding it on top.
        if (!name || gatedHidden.has(name)) return;
        await obs.setInputMuted(name, steppedOutToAside || inPrivateRoom).catch(() => {});
        await obs.removeDimFilter(name).catch(() => {});
      };
      await apply(entry.source);
      await apply(entry.characterSource);
    }
  }
  if (changedConfig) {
    const current = configStore.get();
    configStore.save({ ...current, tavern: { ...current.tavern, players } });
  }
  report.inputs = inputs.map((i) => i.name);
  tavernSync = report;
  broadcastStatus();
  return report;
}

// A fresh source name: never take over a Browser Source that is not ours.
// The number that disambiguates a collision (two people sharing a display
// name, most likely) goes on the person's name, not after the "(CP Studio)"
// tail.
function freeSourceName(user, kind, players) {
  const ours = new Set(Object.values(players).flatMap((p) => [p.source, p.characterSource].filter(Boolean)));
  const taken = new Set(tavernSync.inputs.filter((inputName) => !ours.has(inputName)));
  let count = 1;
  let name = tavernSourceName(user, kind, count);
  while (taken.has(name)) name = tavernSourceName(user, kind, ++count);
  return name;
}

// A user's entry: which sources they get (the Participant and Character
// ticks) and the OBS source names while published. Untouched users default
// to Participant on and Character per the Configuration tab setting.
function playerEntry(tavernConfig, key) {
  const entry = tavernConfig.players[key];
  return {
    player: entry && entry.player !== undefined ? entry.player : true,
    character: entry && entry.character !== undefined ? entry.character : tavernConfig.characterWithPlayer,
    source: (entry && entry.source) || '',
    characterSource: (entry && entry.characterSource) || '',
  };
}

function isPublished(entry) {
  return Boolean(entry && (entry.source || entry.characterSource));
}

// Make a user's OBS sources match `wanted` ({ player, character }): create
// a source the first time it's ticked on, otherwise just show or hide the
// one it already has -- turning a tick off never deletes anything in OBS,
// so any placement, scale or filters set by hand there survive. Deleting a
// source is a separate, explicit action (Delete from OBS).
async function applyPublish(key, wanted) {
  const user = tavern.party.find((u) => u.key === key);
  if (!user) throw new Error('That user is not on the Tavern any more.');
  const current = configStore.get();
  const players = { ...current.tavern.players };
  const room = currentTavernRoom();
  if (wanted.player && !allowsPlayer(room)) throw new Error('This room offers Character sources only.');
  if (wanted.character && !allowsCharacter(room)) throw new Error('This room offers Participant sources only.');
  const entry = { ...playerEntry(current.tavern, key), ...wanted };
  if (entry.player && !entry.source) entry.source = freeSourceName(user, 'player', players);
  if (entry.character && !entry.characterSource) entry.characterSource = freeSourceName(user, 'character', players);
  players[key] = entry;
  configStore.save({ ...current, tavern: { ...current.tavern, players } });
  if (entry.source) await obs.setSourceVisible(entry.source, entry.player).catch(() => {});
  if (entry.characterSource) await obs.setSourceVisible(entry.characterSource, entry.character).catch(() => {});
  if (entry.player) gatedHidden.delete(entry.source);
  if (entry.character) gatedHidden.delete(entry.characterSource);
  await syncTavern();
  return players[key];
}

// Publish: the sources a user has ticked.
async function publishPlayer(key) {
  const entry = playerEntry(configStore.get().tavern, key);
  if (!entry.player && !entry.character) throw new Error('Tick Participant or Character first.');
  return applyPublish(key, { player: entry.player, character: entry.character });
}

// A tick changed: remembered always, applied at once when they are published.
async function setChoice(key, field, on) {
  if (field !== 'player' && field !== 'character') throw new Error('Unknown option.');
  const room = currentTavernRoom();
  if (on && field === 'player' && !allowsPlayer(room)) throw new Error('This room offers Character sources only.');
  if (on && field === 'character' && !allowsCharacter(room)) throw new Error('This room offers Participant sources only.');
  const current = configStore.get();
  const entry = playerEntry(current.tavern, key);
  if (isPublished(entry)) return applyPublish(key, { [field]: on });
  const players = { ...current.tavern.players, [key]: { ...entry, [field]: on } };
  configStore.save({ ...current, tavern: { ...current.tavern, players } });
  broadcastStatus();
  return players[key];
}

async function removeObsInput(name) {
  if (!name || !obs.connected) return;
  const inputs = await obs.browserInputs().catch(() => []);
  if (inputs.some((i) => i.name === name)) await obs.removeInput(name);
}

// Unpublish: remove the sources; the ticks stay as they were.
async function unpublishPlayer(key, removeFromObs = true) {
  const current = configStore.get();
  const players = { ...current.tavern.players };
  const entry = players[key];
  if (!entry) return;
  players[key] = { ...entry, source: '', characterSource: '' };
  configStore.save({ ...current, tavern: { ...current.tavern, players } });
  if (removeFromObs) {
    await removeObsInput(entry.source);
    await removeObsInput(entry.characterSource);
  }
  await syncTavern();
}

// ---------------------------------------------------------------------------
// Automations (Foundry modules, e.g. Herald, -> Studio -> OBS)
// ---------------------------------------------------------------------------

const automations = new AutomationsServer();
let lastAutomationsState = null;
automations.on('status', (s) => {
  if (s.state !== lastAutomationsState) {
    lastAutomationsState = s.state;
    logActivity('Automations', s.message || s.state, s.state === 'error' ? 'error' : 'info');
  } else {
    broadcastStatus();
  }
});
automations.on('event', (entry) => {
  logActivity('Automations', `Event received: ${entry.event}`, 'info');
  runAutomationRuleSets(entry).catch((err) => {
    console.warn(`[automations] rule set dispatch failed: ${err.message}`);
    logActivity('Automations', `Rule set dispatch failed: ${err.message}`, 'error');
  });
});

function requireObs() {
  if (!obs.connected) throw new Error('OBS is not connected.');
}

// Strips characters a resolved Data Field value could carry that a
// filesystem path can't -- most urgently "/" (a US-locale {sessionDate}
// reads "9/18/2026"; OBS writes that literally, and a "/" in a filename
// argument is a real directory separator, not text, so it silently created
// nested folders instead of one .mkv). Also covers the rest of Windows'
// reserved set (backslash, colon, the four others below) ahead of the
// Windows build, since a value born on macOS ends up in the same template.
// Control characters are dropped outright. Deliberately narrow: this only
// ever touches a *substituted* value (see formatSessionTemplate's
// `sanitizeValue`), never literal characters the user typed into the
// template itself.
function sanitizeFilenameValue(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .trim();
}

// Substitutes {title}/{campaign} (from eventData -- whatever triggered
// this, e.g. Herald's POST /event data; blank when there is none, such as
// a manual "Time it" run) into a user-configured template -- kept as their
// own fixed aliases since they read from eventData directly, not through
// resolveDataField's fallback-to-eventData branch (same outcome, just not
// routed through the key-lookup logic that only makes sense for a Data
// Field key).
// Any OTHER {name} in the template -- {sessionCampaign}, {sessionDaysLeft},
// {sessionTime}, anything resolveDataField (below) understands -- is
// resolved the same way a setText step's Data Field picker would: a pure
// read, never a mutation. Used by applySessionFilename; anything OBS's own
// %-style recording macros use is untouched, since this only ever replaces
// {..}-bracketed names.
// `sanitizeValue`, when given, runs on each *substituted* value only (not
// on the template's own literal characters) -- applySessionFilename passes
// one to strip filesystem-reserved characters a resolved value could carry
// (a locale date like "9/18/2026", or event data straight off the wire),
// since those would otherwise reach OBS's FilenameFormatting unsanitized
// and get split into real subdirectories on disk (a literal live bug: a
// missing Herald title defaulted to a placeholder and {sessionDate}'s
// slashes turned every recording into a three-level folder tree instead of
// one file). Every other caller (a setText step, a YouTube title/
// description) passes no sanitizer, since a "/" is perfectly legitimate
// there.
function formatSessionTemplate(template, eventData, chain, sanitizeValue) {
  const legacy = {
    title: eventData && typeof eventData.title === 'string' ? eventData.title : '',
    campaign: eventData && typeof eventData.campaign === 'string' ? eventData.campaign : '',
  };
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, key) => {
    const value = Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : resolveDataField(key, eventData, chain);
    return sanitizeValue ? sanitizeValue(value) : value;
  });
}

// Resolves one Data Field key to a string, in this order -- see
// plan-session-metadata-fields.md for the full design:
//   1. An evergreen field (today's date/time) -- computed fresh, no storage.
//   2. A user-created metadataFields entry, by key -- "text"/"number" as
//      you'd expect, plus "textNumber"/"numberText": a fixed text segment
//      glued to a number segment via a typed separator ("Chapter" + "5" ->
//      "Chapter 5"), the number segment optionally zero-padded.
//   3. Not a Studio-known key at all -- fall through to eventData[key]
//      (whatever the triggering event actually sent), the original and
//      only behavior before Studio had any fields of its own.
// A pure read, always -- bumping a Number (or a compound field's number
// segment) is its own explicit action (incrementMetadataField /
// decrementMetadataField, below), not something reading a value can also
// trigger as a side effect. That used to be a trailing "+1"/"-1" on the key
// itself; retired once it became clear that hiding a mutation inside a read
// meant the same field could get bumped twice if two different places both
// referenced its "+1" variant during what was conceptually one action (see
// the "Composing rule sets" note in architecture-automations.md).
function resolveDataField(key, eventData, chain = new Set()) {
  const now = new Date();
  if (key === 'sessionTime') return now.toLocaleTimeString();
  if (key === 'sessionDate') return now.toLocaleDateString();
  if (key === 'sessionDay') return now.toLocaleDateString(undefined, { weekday: 'long' });
  if (key === 'sessionMonth') return now.toLocaleDateString(undefined, { month: 'long' });
  if (key === 'sessionYear') return String(now.getFullYear());

  const field = configStore.get().metadataFields.find((f) => f.key === key);
  if (field) {
    if (field.type === 'textNumber' || field.type === 'numberText') {
      const numberText = field.padding ? String(field.number).padStart(field.padding, '0') : String(field.number);
      return field.type === 'textNumber' ? `${field.text}${field.separator}${numberText}` : `${numberText}${field.separator}${field.text}`;
    }
    if (field.type === 'checkbox') return field.value ? 'Yes' : 'No';
    // A Text field's value can itself contain {token} references (same
    // syntax as the Recording Filename format) -- expanded unconditionally,
    // not opt-in, since a literal value with no {..} in it passes through
    // this untouched anyway (there used to be a separate "Template" type
    // for this; it added a choice without adding a real capability, since
    // Text already had to support everything Template did). Tracks which
    // keys are already being expanded on this branch so a field that
    // references itself, directly or through another Text field, comes
    // back blank instead of recursing forever.
    // "prompt" is stored exactly like Text (see sanitizeMetadataField,
    // src/config.js) and gets the same {token} expansion when read -- the
    // only thing that makes it different is how it gets its value in the
    // first place (see checkAndApplyPrompts below), not how it reads back.
    if (field.type === 'text' || field.type === 'prompt') {
      if (chain.has(key)) return '';
      return formatSessionTemplate(String(field.value), eventData, new Set(chain).add(key));
    }
    // "number" gets the same optional zero-padding a Text+Number/
    // Number+Text field's own number segment already has -- otherwise
    // composing a plain Number into a Text field's {token} template (e.g.
    // "S{sessionSeasonCounter}") had no way to pad at all.
    if (field.type === 'number') return field.padding ? String(field.value).padStart(field.padding, '0') : String(field.value);
    return String(field.value);
  }

  return eventData && typeof eventData[key] === 'string' ? eventData[key] : '';
}

// What a setText step actually writes -- "where it goes" is `param`
// (the source name), this is "what it is", one of three kinds a user
// picks explicitly rather than one ambiguous free-text field:
//   - "literal": a fixed value, typed once, the same every run -- no
//     external caller involved, for a preset the user swaps in by hand
//     (a rule set is still the way to trigger it) or via Herald picking a
//     rule set from its own menu with no data needed at all.
//   - "file": a local text file, read fresh every run.
//   - "dataField": a Data Field key -- see resolveDataField above for the
//     full resolution order (Studio's own built-ins and metadata fields
//     first, the triggering event's own data as the fallback).
// `stepContext` is the whole step object for a rule-set-driven run
// (carrying whichever of value/filePath/dataField its valueType uses), or
// `undefined` for a direct `POST /api/automations/action` call or a "Time
// it" step -- undefined keeps the original convention of reading
// `eventData.text` literally, since a direct caller already fully
// controls what it sends and has no step config to consult.
function resolveTextValue(stepContext, eventData) {
  if (!stepContext) {
    return eventData && typeof eventData.text === 'string' ? eventData.text : '';
  }
  if (stepContext.valueType === 'file') {
    try {
      return fs.readFileSync(stepContext.filePath, 'utf8').trim();
    } catch (err) {
      throw new Error(`Could not read text file "${stepContext.filePath}": ${err.message}`);
    }
  }
  if (stepContext.valueType === 'dataField') {
    return resolveDataField(stepContext.dataField || 'text', eventData);
  }
  return stepContext.value || ''; // "literal", and the default for anything unrecognised
}

// setMetadataField's own value, same three-source shape as resolveTextValue
// just above (fixed/file/event-data-field) -- but for a direct
// `POST /api/automations/action` call (no stepContext), it reads
// `data.value` rather than `data.text`, since "the value to store in this
// field" reads more plainly than reusing setText's own key name for an
// unrelated action.
function resolveMetadataFieldValue(stepContext, eventData) {
  if (!stepContext) {
    return eventData && typeof eventData.value === 'string' ? eventData.value : '';
  }
  if (stepContext.valueType === 'file') {
    try {
      return fs.readFileSync(stepContext.filePath, 'utf8').trim();
    } catch (err) {
      throw new Error(`Could not read text file "${stepContext.filePath}": ${err.message}`);
    }
  }
  if (stepContext.valueType === 'dataField') {
    return resolveDataField(stepContext.dataField || 'value', eventData);
  }
  return stepContext.value || ''; // "literal", and the default for anything unrecognised
}

// Finds every "prompt"-type Metadata field a rule set's steps would touch if
// it ran right now, walking into any nested runRuleSet target the same way
// actually running the rule set would (cycle-guarded, same idea as
// runRuleSet's own `chain`) -- this is what lets GET /capabilities'
// per-rule-set `prompts` list (and the run-time gate below) be correct for
// a rule set like "Begin Session Recording" that never references
// sessionTitle directly, only through the "Set Session Info" rule set it
// calls via runRuleSet. A static, dry-run mirror of the same {token}/
// Text-field-composition walk resolveDataField/formatSessionTemplate do at
// read time -- it doesn't call them, since it needs to *find* prompt keys
// rather than produce a final string, but it follows the identical
// structure so it can't drift out of sync with what actually gets read.
function collectRequiredPrompts(ruleSet, allRuleSets, metadataFields, seenRuleSets = new Set(), out = new Set()) {
  if (seenRuleSets.has(ruleSet.id)) return out;
  const nextSeenRuleSets = new Set(seenRuleSets).add(ruleSet.id);

  const addKey = (key, fieldChain = new Set()) => {
    if (!key || fieldChain.has(key)) return;
    const field = metadataFields.find((f) => f.key === key);
    if (!field) return; // evergreen or unknown to Studio -- never a prompt
    if (field.type === 'prompt') {
      out.add(key);
      return;
    }
    if (field.type === 'text') addTemplate(String(field.value), new Set(fieldChain).add(key));
  };
  const addTemplate = (template, fieldChain = new Set()) => {
    for (const m of String(template || '').matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)) addKey(m[1], fieldChain);
  };

  for (const step of ruleSet.steps) {
    if (step.type !== 'action') continue;
    if ((step.action === 'setText' || step.action === 'setMetadataField') && step.valueType === 'dataField') {
      addKey(step.dataField || (step.action === 'setMetadataField' ? 'value' : 'text'));
    } else if (step.action === 'applySessionFilename') {
      // The *current* filename template, same one applySessionFilename
      // itself would actually read at run time.
      const { filenameFormat } = configStore.get().session;
      if (filenameFormat) addTemplate(filenameFormat);
    } else if (step.action === 'uploadToYouTube') {
      for (const f of [step.titleField, step.descriptionField, step.categoryField, step.visibilityField]) addKey(f);
    } else if (step.action === 'runRuleSet' && step.param) {
      const target = allRuleSets.find((r) => r.id === step.param);
      if (target) collectRequiredPrompts(target, allRuleSets, metadataFields, nextSeenRuleSets, out);
    }
  }
  return out;
}

// Whether a Prompt field currently has no answer -- the one thing that
// actually makes it "required" right now, as opposed to merely "touched by
// this rule set's steps" (which is all collectRequiredPrompts itself knows).
// Shared by checkAndApplyPrompts (enforcement) and getRuleSets's own
// `prompts` annotation below (GET /capabilities, i.e. discovery) so the two
// can never drift apart the way they did live: capabilities kept listing a
// field as required after it had already been answered and persisted --
// checkAndApplyPrompts correctly let the run through regardless (it did its
// own blank check), but a caller like Herald, reasonably reading
// capabilities' `prompts` to decide whether to show a dialog, had no way to
// know the field didn't actually need asking again.
function isPromptFieldBlank(metadataFields, key) {
  const field = metadataFields.find((f) => f.key === key);
  return !(field && typeof field.value === 'string' && field.value);
}

// The enforcement half of collectRequiredPrompts: a rule set that touches a
// "prompt" field cannot run while that field is genuinely blank, without a
// fresh answer supplied in the exact same call that triggers it -- there is
// no other way for a prompt field to get a value at all (see
// METADATA_FIELD_TYPES's comment, src/config.js), so this is the only gate
// that matters, and it has to run before anything actually fires. Called
// synchronously from the automations.js /event handler (before the event is
// even recorded) and from the 'automations:testEvent' IPC handler below, so
// a missing answer means the request never dispatches anything at all --
// not "dispatches with a blank."
//
// "Genuinely blank" is the key word: a required field that already holds
// *any* value (from an earlier, different call) is satisfied without being
// re-supplied here. This was initially unconditional -- answer required
// every single call, no exceptions -- but that meant a title answered once
// at "Begin Session Recording" got demanded again at Stop, purely because
// "Upload to Youtube" also reads it (via a composed Text field referencing
// {sessionTitle}); the whole point of a Prompt field's persistence is
// defeated by re-asking for something already known. A supplied answer
// still always overwrites whatever's there, so "update this any time" (the
// original Herald use case for Description) keeps working exactly the same.
// What resets a field back to blank -- so the *next* recording is asked
// fresh instead of silently reusing this one's leftover answer forever --
// is clearMetadataField, a separate explicit action (see
// runAutomationAction below), not anything here.
function checkAndApplyPrompts(event, providedPrompts) {
  const current = configStore.get();
  const { ruleSets } = current.automations;
  const matched = ruleSets.filter((r) => r.enabled && r.event === event);
  const required = new Set();
  for (const ruleSet of matched) {
    for (const key of collectRequiredPrompts(ruleSet, ruleSets, current.metadataFields)) required.add(key);
  }
  if (!required.size) return { ok: true };

  const provided = providedPrompts && typeof providedPrompts === 'object' ? providedPrompts : {};
  const isBlank = (key) => isPromptFieldBlank(current.metadataFields, key);
  const missing = [...required].filter((key) => !(typeof provided[key] === 'string' && provided[key]) && isBlank(key));
  if (missing.length) {
    const labels = missing.map((key) => (current.metadataFields.find((f) => f.key === key) || {}).label || key);
    return { ok: false, error: `Missing required prompt value(s): ${labels.join(', ')}` };
  }

  // Only writes what was actually supplied -- a required field already
  // satisfied by an existing value and not answered again here is left
  // exactly as it was, not overwritten with nothing.
  const toWrite = [...required].filter((key) => typeof provided[key] === 'string' && provided[key]);
  if (toWrite.length) {
    configStore.save({
      ...current,
      metadataFields: current.metadataFields.map((f) => (toWrite.includes(f.key) ? { ...f, value: provided[f.key] } : f)),
    });
    broadcastStatus();
  }
  return { ok: true };
}

// One step's action -> the OBS or Studio call it makes. `param` is the
// step's own value: a scene name for sceneSwitch, a source name for
// sourceShow/sourceHide/sourceToggle/setText, ignored otherwise.
// `eventData` is whatever triggered this (undefined for a manual "Time
// it" run or a direct action call with none given);
// `stepContext` (only read by setText, via resolveTextValue above) is the
// rule-set step itself, or undefined for a direct call. OBS actions need
// OBS connected; Studio actions (everything from wakeAudio down) work
// regardless -- none of them but syncObs and applySessionFilename touch
// OBS at all. `chain` is the set of rule-set ids already running further up
// this same call stack -- only ever non-empty when a `runRuleSet` step led
// here, threaded through so a cycle (A runs B runs A) is refused instead of
// recursing forever; a direct call (a step run from the UI, a "Time it"
// test, a bare `POST /action`) always starts with an empty one.
async function runAutomationAction(action, param, eventData, stepContext, chain = new Set(), ruleSetId) {
  switch (action) {
    case 'sceneSwitch':
      requireObs();
      if (!param) throw new Error('sceneSwitch needs a scene name.');
      return obs.switchToScene(param);
    case 'sourceShow':
      requireObs();
      if (!param) throw new Error('sourceShow needs a source name.');
      return obs.setSourceVisible(param, true);
    case 'sourceHide':
      requireObs();
      if (!param) throw new Error('sourceHide needs a source name.');
      return obs.setSourceVisible(param, false);
    case 'sourceToggle':
      requireObs();
      if (!param) throw new Error('sourceToggle needs a source name.');
      return obs.toggleSourceVisible(param);
    case 'setText': {
      requireObs();
      if (!param) throw new Error('setText needs a source name.');
      return obs.setInputText(param, resolveTextValue(stepContext, eventData));
    }
    case 'startRecording':
      requireObs();
      return obs.startRecording();
    case 'pauseRecording':
      requireObs();
      return obs.pauseRecording();
    case 'resumeRecording':
      requireObs();
      return obs.resumeRecording();
    case 'stopRecording':
      requireObs();
      return obs.stopRecording();
    case 'startStreaming':
      requireObs();
      return obs.startStreaming();
    case 'stopStreaming':
      requireObs();
      return obs.stopStreaming();
    case 'wakeAudio':
      for (const id of viewWindows.keys()) {
        if (wakeAudio(id)) wakeWhenReady(id, 5000);
      }
      return;
    case 'startAll':
      return openAllViews();
    case 'stopAll':
      return closeAllViews();
    case 'dockAll':
      return collapseViews();
    case 'undockAll':
      return expandViews();
    case 'syncObs':
      requireObs();
      return syncObs();
    case 'applySessionFilename': {
      requireObs();
      const { filenameFormat } = configStore.get().session;
      if (!filenameFormat) throw new Error('Set a filename format on the Automations tab first.');
      return obs.setFilenameFormat(formatSessionTemplate(filenameFormat, eventData, undefined, sanitizeFilenameValue));
    }
    case 'runRuleSet': {
      if (!param) throw new Error('runRuleSet needs a rule set to run.');
      const { ruleSets } = configStore.get().automations;
      const target = ruleSets.find((r) => r.id === param);
      if (!target) throw new Error(`Rule set not found: ${param}`);
      if (chain.has(target.id)) {
        throw new Error(`"${target.name || target.id}" is already running earlier in this same chain -- refusing to loop.`);
      }
      return runRuleSet(target, eventData, new Set([...chain, target.id]));
    }
    case 'incrementMetadataField':
    case 'decrementMetadataField': {
      if (!param) throw new Error(`${action} needs a Metadata field.`);
      const delta = action === 'incrementMetadataField' ? 1 : -1;
      const current = configStore.get();
      const field = current.metadataFields.find((f) => f.key === param);
      if (!field) throw new Error(`Metadata field not found: ${param}`);
      let patch;
      if (field.type === 'number') patch = { value: Number(field.value) + delta };
      else if (field.type === 'textNumber' || field.type === 'numberText') patch = { number: field.number + delta };
      else throw new Error(`"${field.label}" isn't a Number field -- nothing to ${delta > 0 ? 'increment' : 'decrement'}.`);
      configStore.save({ ...current, metadataFields: current.metadataFields.map((f) => (f.key === param ? { ...f, ...patch } : f)) });
      broadcastStatus();
      return;
    }
    // Writes an explicit value into a Text-type Metadata field's stored
    // `value` -- the persistence increment/decrement give Number fields,
    // generalized to an explicit set rather than +/-1. This is what lets a
    // value survive between two separate calls (a title set before
    // recording starts, read minutes later when the filename is applied; a
    // description updated at any point, read later still when a YouTube
    // upload step runs) -- something no other action did before this one,
    // since setText writes an OBS text *source*, not Studio's own stored
    // state. Scoped to "text" only, deliberately: a Number/textNumber/
    // numberText field already has an explicit action that owns it
    // (increment/decrement), and a checkbox field's only sensible values
    // are boolean, not a string one of this action's own three sources
    // would produce.
    case 'setMetadataField': {
      if (!param) throw new Error('setMetadataField needs a Metadata field.');
      const current = configStore.get();
      const field = current.metadataFields.find((f) => f.key === param);
      if (!field) throw new Error(`Metadata field not found: ${param}`);
      if (field.type !== 'text') throw new Error(`"${field.label}" isn't a Text field -- nothing to set.`);
      const value = resolveMetadataFieldValue(stepContext, eventData);
      configStore.save({ ...current, metadataFields: current.metadataFields.map((f) => (f.key === param ? { ...f, value } : f)) });
      broadcastStatus();
      return;
    }
    // Resets a "prompt" field back to blank -- the other half of blank-
    // check semantics in checkAndApplyPrompts above. Answering a Prompt
    // field no longer forces a re-answer on every later touch, which means
    // something has to put it back to blank when its episode/session is
    // actually over, or the same answer would silently satisfy every
    // future run forever. Placed as a step wherever that "this is over"
    // moment actually is (the end of an Upload to Youtube run, say) --
    // Studio has no notion of "episode over" on its own, so this has to be
    // deliberate, not automatic. Scoped to "prompt" only, same reasoning
    // setMetadataField is scoped to "text" only: a plain Text field can
    // already be set to '' through that action, so a separate action here
    // would be redundant for it.
    case 'clearMetadataField': {
      if (!param) throw new Error('clearMetadataField needs a Metadata field.');
      const current = configStore.get();
      const field = current.metadataFields.find((f) => f.key === param);
      if (!field) throw new Error(`Metadata field not found: ${param}`);
      if (field.type !== 'prompt') throw new Error(`"${field.label}" isn't a Prompt field -- nothing to clear back to blank.`);
      configStore.save({ ...current, metadataFields: current.metadataFields.map((f) => (f.key === param ? { ...f, value: '' } : f)) });
      broadcastStatus();
      return;
    }
    case 'uploadToYouTube':
      return runYouTubeUpload(stepContext || {}, eventData, ruleSetId);
    // A real OS notification (Notification Center on macOS, the Action
    // Center on Windows) -- not just something inside Studio's own window,
    // since the whole point is reaching someone who isn't looking at
    // Studio at all right now (a failed YouTube upload that needs a human
    // to go handle manually, the natural pairing with runIf's "onFailure",
    // though nothing here requires that pairing). `param` is the message,
    // {token}-expanded the same way a filename template or a Text Metadata
    // field's value already is, so a step can say something like "Upload
    // failed for {sessionTitle}". Also pushes the in-app toast (a second,
    // more immediate layer for whoever happens to already be looking at
    // Studio's panel right now) and always logs to the Connections
    // activity feed, so nothing is lost even if the OS notification itself
    // is denied, silenced, or missed -- see Notification.isSupported()
    // below; on a fresh install macOS may need the user to grant Studio
    // notification permission once, same as any other app.
    case 'showToast': {
      if (!param) throw new Error('showToast needs a message.');
      const message = formatSessionTemplate(param, eventData);
      if (Notification.isSupported()) {
        new Notification({ title: 'Coffee Pub Studio', body: message }).show();
      }
      if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('toast', message);
      }
      logActivity('Automations', `Notification: ${message}`, 'error');
      return;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// uploadToYouTube's own logic, kept out of the switch above -- it needs
// five named step fields (titleField/descriptionField/categoryField/
// madeForKidsField/visibilityField), not the single param/dataField shape
// every other action uses, and a genuinely multi-step body (find the file,
// resolve each field, upload). No playlist support -- see "Playlist
// support" in architecture-automations.md for why.
//
// madeForKidsField alone is strict: it must point at a real "checkbox"
// Metadata field, or this throws rather than guessing a default -- a COPPA
// declaration is consequential enough that silently defaulting it on a
// stale or missing field reference would hide a real configuration mistake
// instead of surfacing it (same reasoning incrementMetadataField uses for a
// field that isn't Number-shaped). visibilityField is strict in a
// different way: it's a plain Data Field like Title/Description (any
// Metadata field, any evergreen), but if it resolves to something at all,
// that something must be exactly "private"/"unlisted"/"public" -- whether
// a recording becomes publicly visible is exactly the kind of mistake a
// typo shouldn't quietly get wrong. categoryField has no such check: it's
// permissive like Description, since YouTube's category list is large and
// there is no small, meaningful set to validate against.
// ruleSetId (the rule set this step is running as part of, threaded down
// from runRuleSet/runAutomationAction) is optional -- only used to key
// youtubeUploadProgress so the Automations tab can show a progress bar on
// the specific card that's uploading; a direct "Time it" test run passes
// none, and the upload still works, just without a progress bar to update.
async function runYouTubeUpload(step, eventData, ruleSetId) {
  const y = configStore.get().youtube;
  if (!y.enabled) throw new Error('YouTube upload is off -- enable it on the Automations tab first.');

  const filePath = step.filePath || obs.lastRecordingPath;
  if (!filePath) throw new Error('No recording to upload -- record something first, or set a file on this step.');
  if (!fs.existsSync(filePath)) throw new Error(`Recording file not found: ${filePath}`);

  const title = resolveDataField(step.titleField || '', eventData);
  if (!title) throw new Error('uploadToYouTube needs a Title field that resolves to something.');
  const description = step.descriptionField ? resolveDataField(step.descriptionField, eventData) : '';

  const fields = configStore.get().metadataFields;
  const madeForKidsField = fields.find((f) => f.key === step.madeForKidsField);
  if (!madeForKidsField || madeForKidsField.type !== 'checkbox') {
    throw new Error('uploadToYouTube needs a checkbox-type Metadata field wired to "Made for kids".');
  }
  // Checked = yes, made for kids -- direct, matching the field's own label
  // and the API's own field name, not inverted. (Used to be a "Not made
  // for kids" field with the opposite polarity: checked meant NOT for
  // kids, which read as a double negative once you had to reason about
  // what an unchecked box actually meant -- "made for kids" checked=yes is
  // the plainer question to answer.)
  const selfDeclaredMadeForKids = Boolean(madeForKidsField.value);

  let privacyStatus = y.privacyStatus;
  if (step.visibilityField) {
    const resolved = resolveDataField(step.visibilityField, eventData).trim().toLowerCase();
    if (resolved) {
      if (!['private', 'unlisted', 'public'].includes(resolved)) {
        throw new Error(`uploadToYouTube's Visibility field resolved to "${resolved}", not "private", "unlisted", or "public".`);
      }
      privacyStatus = resolved;
    }
  }

  let categoryId = y.categoryId;
  if (step.categoryField) {
    const resolved = resolveDataField(step.categoryField, eventData).trim();
    if (resolved) categoryId = resolved;
  }

  logActivity('YouTube', `Upload started: "${title}" (${privacyStatus})`, 'info');
  let lastLoggedPercent = -1;
  if (ruleSetId) {
    youtubeUploadProgress.set(ruleSetId, 0);
    broadcastStatus();
  }
  const signal = ruleSetId && ruleSetRunState.get(ruleSetId) ? ruleSetRunState.get(ruleSetId).abort.signal : undefined;
  try {
    const { videoId, url, resumed } = await youtube.uploadVideo(
      filePath,
      { title: title.slice(0, 100), description, categoryId, privacyStatus, selfDeclaredMadeForKids },
      (fraction) => {
        const percent = Math.floor(fraction * 100);
        if (ruleSetId) {
          youtubeUploadProgress.set(ruleSetId, percent);
          broadcastStatus();
        }
        if (percent >= lastLoggedPercent + 10) {
          lastLoggedPercent = percent;
          logActivity('YouTube', `Upload progress: ${percent}%`, 'info');
        }
      },
      signal
    );
    logActivity('YouTube', `Upload complete${resumed ? ' (resumed an earlier interrupted upload)' : ''}: ${url}`, 'info');
    return { videoId, url };
  } catch (err) {
    if (err && err.message === 'Upload cancelled.') {
      logActivity('YouTube', 'Upload cancelled -- the next run of the same file resumes from where it stopped.', 'info');
    }
    throw err;
  } finally {
    if (ruleSetId) {
      youtubeUploadProgress.delete(ruleSetId);
      broadcastStatus();
    }
  }
}

// A rule set's numbered sequence, grouped into stages: a plain (non-`and`)
// action step, or a delay step, starts a new stage; a following `and`
// action step joins the current stage instead of starting its own. An
// action stage runs every step in it at once; a delay stage just waits.
// `runIf` (src/config.js) comes from whichever step actually opened the
// stage -- a joining `and` step's own runIf is never consulted, since the
// whole stage runs or doesn't run together (see runRuleSet's gate below).
function stagesFor(steps) {
  const stages = [];
  for (const step of steps) {
    // Skipped as if it weren't in the sequence at all -- not "run it but do
    // nothing" -- so an AND step right after a disabled one groups with
    // whichever enabled step actually precedes it.
    if (step.enabled === false) continue;
    if (step.type === 'delay') {
      // id kept (unlike the rest of a delay stage's shape) so runRuleSet
      // can report it as the active step while waiting -- a Wait row
      // benefits from the same "this is what's happening right now"
      // highlight an action step gets.
      stages.push({ kind: 'delay', seconds: step.seconds, id: step.id });
      continue;
    }
    if (step.and && stages.length && stages[stages.length - 1].kind === 'action') {
      stages[stages.length - 1].steps.push(step);
    } else {
      stages.push({ kind: 'action', steps: [step], runIf: step.runIf || 'always' });
    }
  }
  return stages;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Whether a rule set is currently mid-run, and the means to stop it early
// (the Automations tab's Run/Stop toggle). Keyed by rule set id, ref-counted
// rather than a boolean since the same rule set can genuinely be running
// more than once at a time -- a real trigger firing again while a manual
// "Run Automation" of the same rule set is still going, or (nested) two
// different callers both invoking it via the `runRuleSet` Studio action.
// `cancelled` is shared by every concurrent run of that id, so Stop halts
// all of them, not just whichever one the button happened to start.
const ruleSetRunState = new Map();

function beginRuleSetRun(id) {
  let state = ruleSetRunState.get(id);
  if (!state) {
    state = { count: 0, cancelled: false, activeStepIds: [], abort: new AbortController() };
    ruleSetRunState.set(id, state);
  }
  state.count += 1;
  broadcastStatus();
  return state;
}

function endRuleSetRun(id) {
  const state = ruleSetRunState.get(id);
  if (!state) return;
  state.count -= 1;
  if (state.count <= 0) ruleSetRunState.delete(id);
  broadcastStatus();
}

function cancelRuleSetRun(id) {
  const state = ruleSetRunState.get(id);
  if (!state) return;
  state.cancelled = true;
  // Also aborts anything mid-flight that takes a signal (today: a YouTube
  // upload's fetch calls) -- a stage already dispatched no longer has to
  // run to completion.
  state.abort.abort();
}

// A delay that gives up early once `state.cancelled` is set, checked every
// 200ms rather than only after the full wait -- so Stop takes effect
// within a fraction of a second even mid-delay, not only between stages.
async function sleepCancellable(ms, state) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (state.cancelled) return;
    await sleep(Math.min(200, end - Date.now()));
  }
}

// Runs a rule set's stages in order. OBS never tells Studio a scene "is
// done" -- there is no such event on the WebSocket API -- so delays are
// plain timers Studio keeps itself, not a wait for OBS to confirm anything.
// One step failing (OBS not connected, a scene that doesn't exist) does not
// stop the rest of its stage or the stages after it. `chain` defaults to
// just this rule set's own id -- the normal case, a fresh top-level run;
// `runAutomationAction`'s `runRuleSet` case passes a larger one down when
// this run is itself nested inside another.
//
// Stop (cancelRuleSetRun) prevents any stage that hasn't started from
// starting, and aborts a YouTube upload that's mid-flight (it takes the
// run's AbortSignal). Other stage actions -- OBS calls already dispatched --
// still run to completion; they're single quick calls with nothing worth
// aborting, and a step failing doesn't roll back the ones before it either.
async function runRuleSet(ruleSet, eventData, chain = new Set([ruleSet.id])) {
  const state = beginRuleSetRun(ruleSet.id);
  // Tracks whether the last action stage that actually ran had every step
  // succeed, or at least one fail -- what an "On Success"/"On Failure"
  // stage checks itself against. Starts 'success' (vacuously: nothing has
  // failed yet) so a gated stage early in the sequence doesn't spuriously
  // skip for lack of anything to check. A delay stage, or a stage skipped
  // by its own gate, leaves this untouched -- "previous" always means the
  // last stage that actually *ran*, not merely the one before it in the
  // list, so a chain of several gated stages can all key off one real
  // outcome further back.
  let lastOutcome = 'success';
  try {
    for (const stage of stagesFor(ruleSet.steps)) {
      if (state.cancelled) break;
      if (stage.kind === 'action' && stage.runIf && stage.runIf !== 'always') {
        const wantsSuccess = stage.runIf === 'onSuccess';
        if ((wantsSuccess && lastOutcome !== 'success') || (!wantsSuccess && lastOutcome !== 'failure')) {
          const label = wantsSuccess ? 'On Success' : 'On Failure';
          logActivity(
            'Automations',
            `Rule set "${ruleSet.name}" skipped a step (${label}) -- the previous step ${lastOutcome === 'success' ? 'succeeded' : 'failed'}.`,
            'info'
          );
          continue;
        }
      }
      // Whichever step(s) this stage covers -- an AND-grouped action stage
      // highlights all of them at once, since they really are running
      // together, not one after another.
      state.activeStepIds = stage.kind === 'delay' ? [stage.id] : stage.steps.map((s) => s.id);
      broadcastStatus();
      if (stage.kind === 'delay') {
        await sleepCancellable(stage.seconds * 1000, state);
        continue;
      }
      let stageFailed = false;
      await Promise.all(
        stage.steps.map((step) =>
          runAutomationAction(step.action, step.param, eventData, step, chain, ruleSet.id).catch((err) => {
            stageFailed = true;
            const message = `Rule set "${ruleSet.name}" step -> ${step.action} failed: ${err.message}`;
            console.warn(`[automations] ${message}`);
            logActivity('Automations', message, 'error');
          })
        )
      );
      lastOutcome = stageFailed ? 'failure' : 'success';
    }
  } finally {
    state.activeStepIds = [];
    endRuleSetRun(ruleSet.id);
  }
}

// Every enabled rule set whose `event` matches the incoming one runs, each
// independently -- one rule set's sequence does not wait for another's, and
// a rule set that matches again while already mid-sequence just runs a
// second, overlapping time (OBS actions are idempotent, so overlap is
// harmless). Both runs share the same ruleSetRunState entry (see
// runRuleSet) -- Stop halts every concurrent run of that id at once, not
// just whichever one the Automations tab's button happened to start.
async function runAutomationRuleSets(entry) {
  const { ruleSets } = configStore.get().automations;
  const matched = ruleSets.filter((r) => r.enabled && r.event === entry.event);
  for (const ruleSet of matched) {
    runRuleSet(ruleSet, entry.data).catch((err) => {
      const message = `Rule set "${ruleSet.name}" failed: ${err.message}`;
      console.warn(`[automations] ${message}`);
      logActivity('Automations', message, 'error');
    });
  }
}

// Starts or stops the HTTPS server to match current settings -- called at
// launch and again whenever Automations settings are saved, so toggling
// Enable or editing the port/token takes effect immediately.
async function syncAutomationsServer() {
  const a = configStore.get().automations;
  if (a.enabled) {
    await automations.start({
      port: a.port,
      getToken: () => configStore.get().automations.token,
      // Annotated with `prompts` here (rather than automations.js computing
      // it) since collectRequiredPrompts and configStore both live on this
      // side -- automations.js just passes each rule set's own `prompts`
      // straight through to GET /capabilities. Filtered through
      // isPromptFieldBlank -- a field collectRequiredPrompts found this rule
      // set touches but that already holds a value is NOT included, same as
      // checkAndApplyPrompts's own enforcement already treats it. Without
      // this, capabilities kept advertising a field as required forever
      // after it was first answered, even though firing the event with no
      // answer for it would have succeeded anyway -- a caller reasonably
      // trusting `prompts` to decide whether to show a dialog had no way to
      // know that.
      getRuleSets: () => {
        const { ruleSets } = configStore.get().automations;
        const { metadataFields } = configStore.get();
        return ruleSets.map((r) => ({
          ...r,
          prompts: [...collectRequiredPrompts(r, ruleSets, metadataFields)]
            .filter((key) => isPromptFieldBlank(metadataFields, key))
            .map((key) => ({
              key,
              label: (metadataFields.find((f) => f.key === key) || {}).label || key,
            })),
        }));
      },
      actions: [...AUTOMATIONS_ACTION_SCHEMA, ...STUDIO_ACTION_SCHEMA],
      runAction: (action, param, data) => runAutomationAction(action, param, data),
      checkPrompts: (event, prompts) => checkAndApplyPrompts(event, prompts),
      getScenes: () => (obs.connected ? obs.listScenes() : Promise.resolve([])),
      getSources: () => (obs.connected ? obs.listSourceNames() : Promise.resolve([])),
      getMetadataFields: () => configStore.get().metadataFields,
      getObsStatus: () => {
        const o = obs.status();
        return {
          obsConnected: o.state === 'connected',
          recording: o.outputs.recording,
          recordingPaused: o.outputs.recordingPaused,
          streaming: o.outputs.streaming,
          scene: o.outputs.scene,
        };
      },
      certDir: app.getPath('userData'),
    });
  } else {
    await automations.stop();
  }
}

// Compares actual DER bytes, not a fingerprint string -- Electron's
// Certificate.fingerprint format isn't documented precisely enough (which
// hash, what encoding) to trust a string match on, where getting it wrong
// either trusts nothing (silent, hard to notice) or -- far worse -- trusts
// something it shouldn't. Parsing both to X509Certificate and comparing
// .raw sidesteps the question entirely.
function trustsOwnAutomationsCert(certificate) {
  try {
    const theirs = new crypto.X509Certificate(certificate.data);
    const ours = new crypto.X509Certificate(automations.certPem);
    return Buffer.compare(theirs.raw, ours.raw) === 0;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAlive(win) {
  return Boolean(win) && !win.isDestroyed();
}

function displaySummary(display) {
  return {
    id: display.id,
    label: display.label || `Display ${display.id}`,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: display.id === screen.getPrimaryDisplay().id,
  };
}

// A user gesture for the page, so its audio may start: a middle-button
// click in the middle of the page (Foundry does nothing with the middle
// button, and a click is what its audio gate waits for), plus an F16 key
// press, which means nothing to the page either.
function wakeAudio(id) {
  const wc = pageOf(id);
  const win = viewWindows.get(id);
  if (!wc || wc.isDestroyed() || !isAlive(win)) return false;
  try {
    const [width, height] = pageSize(win);
    const x = Math.round(width / 2);
    const y = Math.round(height / 2);
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'middle', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'middle', clickCount: 1 });
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'F16' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'F16' });
    return true;
  } catch (err) {
    console.warn(`[${id}] wake audio: ${err.message}`);
    return false;
  }
}

// What the page says about itself: whether it is Foundry, whether Foundry
// has finished loading, and whether its audio is still locked behind a
// first gesture. null when the page cannot be asked.
async function pageAudioState(wc) {
  try {
    // Foundry declares `game` with let, so it is a global binding but not a
    // window property; look it up by name in the page's own scope.
    return await wc.executeJavaScript(
      '(() => { const g = typeof game !== "undefined" ? game : window.game; if (!g || typeof g !== "object") return { foundry: false };' +
        ' return { foundry: true, ready: g.ready === true, locked: g.audio && typeof g.audio.locked === "boolean" ? g.audio.locked : null }; })()',
      true,
    );
  } catch (err) {
    return null;
  }
}

// Wake the page's audio: wait the delay set on the Configuration tab (Foundry
// ignores clicks until it has finished setting up, which the page does not
// announce reliably), click, then keep clicking every few seconds while
// Foundry still reports its audio locked. Gives up after three minutes.
const wakeTimers = new Map();
function stopWake(id) {
  clearTimeout(wakeTimers.get(id));
  wakeTimers.delete(id);
}
function wakeWhenReady(id, delayMs = configStore.get().wakeAudioDelay * 1000) {
  stopWake(id);
  const started = Date.now();
  let clicks = 0;
  const tick = async () => {
    wakeTimers.delete(id);
    const wc = pageOf(id);
    if (!wc || wc.isDestroyed() || Date.now() - started > delayMs + 180000) return;
    wakeAudio(id);
    clicks += 1;
    const state = await pageAudioState(wc);
    if (!state || !state.foundry || state.locked !== true || clicks >= 30) return; // not Foundry, unlocked, or enough tries
    wakeTimers.set(id, setTimeout(tick, 5000));
  };
  wakeTimers.set(id, setTimeout(tick, delayMs));
}

function viewStatus(view) {
  const win = viewWindows.get(view.id);
  if (!isAlive(win)) {
    return { id: view.id, open: false };
  }
  const [width, height] = pageSize(win);
  const [x, y] = win.getPosition();
  const display = screen.getDisplayMatching(win.getBounds());
  const wc = pageOf(view.id);
  return {
    id: view.id,
    open: true,
    title: win.getTitle(),
    x,
    y,
    width,
    height,
    captureWidth: Math.round(width * display.scaleFactor),
    captureHeight: Math.round(height * display.scaleFactor),
    scaleFactor: display.scaleFactor,
    displayId: display.id,
    displayLabel: displaySummary(display).label,
    url: wc ? wc.getURL() : '',
    loading: wc ? wc.isLoading() : false,
    muted: wc ? wc.isAudioMuted() : false,
    audible: wc ? wc.isCurrentlyAudible() : false,
    barHeight: BAR_HEIGHT,
    cropTop: Math.round(BAR_HEIGHT * display.scaleFactor),
  };
}

function fullStatus() {
  return {
    views: configStore.get().views.map(viewStatus),
    displays: screen.getAllDisplays().map(displaySummary),
    config: configStore.get(),
    obs: { ...obs.status(), hasPassword: readObsPassword() !== '' },
    tavern: { ...tavern.status(), hasPassword: readSecret(TAVERN_SECRET_PATH) !== '', sync: tavernSync },
    automations: {
      ...automations.status(),
      runningRuleSetIds: [...ruleSetRunState.keys()],
      activeStepIds: Object.fromEntries([...ruleSetRunState.entries()].map(([id, s]) => [id, s.activeStepIds || []])),
      youtubeUploadProgress: Object.fromEntries(youtubeUploadProgress),
    },
    appWindows: Object.fromEntries(
      configStore.get().appWindows.map((a) => [a.id, { found: Boolean(appWindowResolved[`app:${a.id}`]), matched: appWindowMatched[`app:${a.id}`] || '', inObs: obs.status().inputs.includes(a.sourceName) }])
    ),
    youtube: { connected: readYoutubeSecret().refreshToken !== '', hasClientSecret: readYoutubeSecret().clientSecret !== '', connecting: youtubeConnectState },
    activity: activityLog,
    collapsed,
    parkedIds: [...parked.keys()],
  };
}

function broadcastStatus() {
  if (isAlive(controlWindow)) {
    controlWindow.webContents.send('status', fullStatus());
  }
  refreshTrayMenu();
  sendDockState();
}

function getView(id) {
  const view = configStore.getView(id);
  if (!view) throw new Error(`Unknown view: ${id}`);
  return view;
}

// ---------------------------------------------------------------------------
// View windows (the things OBS captures)
// ---------------------------------------------------------------------------

function windowTitle(view) {
  return `${APP_NAME} - ${view.label}`;
}

// The system window ID macOS assigns to an open, visible view window
// (changes on every launch), or null when the window is not on screen yet:
// OBS cannot start a working capture of a window that is not shown.
function systemWindowId(win) {
  if (!isAlive(win) || !win.isVisible()) return null;
  const match = /^window:(\d+):/.exec(win.getMediaSourceId() || '');
  return match ? Number.parseInt(match[1], 10) : null;
}

// The Foundry page's webContents for a view, or null when not open.
function pageOf(id) {
  const view = pageViews.get(id);
  return view && !view.webContents.isDestroyed() ? view.webContents : null;
}

// Size of the page area (window content minus the bar), in points.
function pageSize(win) {
  const [w, h] = win.getContentSize();
  return [w, Math.max(1, h - BAR_HEIGHT)];
}

function scaleFactorOf(win) {
  return screen.getDisplayMatching(win.getBounds()).scaleFactor;
}

// Crop/Pad values (captured pixels) that remove the bar from a window capture.
function barCrop(win) {
  if (!isAlive(win)) return null;
  return { left: 0, top: Math.round(BAR_HEIGHT * scaleFactorOf(win)), right: 0, bottom: 0 };
}

function layoutPage(id) {
  const win = viewWindows.get(id);
  const view = pageViews.get(id);
  if (!isAlive(win) || !view) return;
  const [w, h] = pageSize(win);
  view.setBounds({ x: 0, y: BAR_HEIGHT, width: w, height: h });
}

function sendBarState(id) {
  const win = viewWindows.get(id);
  const view = configStore.getView(id);
  if (!isAlive(win) || !view || win.webContents.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const [width, height] = pageSize(win);
  win.webContents.send('bar:state', { id, label: view.label, x, y, width, height });
}

// Measure a page element inside a view: { x, y, width, height } in page
// points, or null when the element is not found.
async function measureSelector(wc, rawSelector) {
  const candidates = selectorCandidates(rawSelector);
  if (!wc || wc.isDestroyed() || !candidates.length) return null;
  const code = `(() => {
    let el = null;
    for (const sel of ${JSON.stringify(candidates)}) {
      try { el = document.querySelector(sel); } catch (err) { el = null; }
      if (el) break;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`;
  try {
    const rect = await wc.executeJavaScript(code, true);
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    return {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  } catch (err) {
    return null;
  }
}

// Crop/Pad values (captured pixels) that isolate a region of a view's page.
// The region is in page points; the bar above the page is cropped away too.
function cropFor(win, region) {
  if (!isAlive(win)) return null;
  const [w, h] = pageSize(win);
  const sf = scaleFactorOf(win);
  const x = Math.min(region.x, w);
  const y = Math.min(region.y, h);
  const width = Math.max(1, Math.min(region.width, w - x));
  const height = Math.max(1, Math.min(region.height, h - y));
  return {
    left: Math.round(x * sf),
    top: Math.round((BAR_HEIGHT + y) * sf),
    right: Math.round((w - x - width) * sf),
    bottom: Math.round((h - y - height) * sf),
  };
}

// Re-measure selector regions of an open view and save any changes.
async function refreshRegions(view) {
  const wc = pageOf(view.id);
  if (!wc) return view.regions;
  let changed = false;
  const regions = [];
  for (const region of view.regions) {
    if (region.mode !== 'selector') {
      regions.push(region);
      continue;
    }
    const rect = await measureSelector(wc, region.selector);
    if (rect && (rect.x !== region.x || rect.y !== region.y || rect.width !== region.width || rect.height !== region.height)) {
      regions.push({ ...region, ...rect });
      changed = true;
    } else {
      regions.push(region);
    }
  }
  if (changed) configStore.updateView(view.id, { regions });
  return regions;
}

// The OBS source names a window maintains: the whole-window source while it
// is switched on. Regions carry their own.
function windowSources(view) {
  return view.windowSource.enabled && view.windowSource.name ? [view.windowSource.name] : [];
}

// Point every linked OBS source at the current windows and keep region
// crops current. An OBS source found capturing a window whose own source is
// missing is adopted as that source, so a capture made by hand in OBS is
// re-pointed automatically from then on.
let obsSyncTimer = null;
// Views whose windows appeared since the last sync: their captures get restarted.
const freshlyShown = new Set();
// view id ("app:<id>") -> the window ID the last sync matched, or null when
// that app's window wasn't open. Drives the "found / not open" indicator on
// the App windows card.
let appWindowResolved = {};
// Same keys -> the OBS label of the window matched, for showing which one.
let appWindowMatched = {};
async function syncObs() {
  if (!obs.connected) return null;
  const force = new Set(freshlyShown);
  freshlyShown.clear();
  const views = [];
  const { retinaDouble } = configStore.get();
  for (const view of configStore.get().views) {
    const win = viewWindows.get(view.id);
    const regions = await refreshRegions(view);
    // On a Retina display the capture has sf times the pixels of the window;
    // unless the user wants that, the sources are scaled back down in OBS.
    const sf = isAlive(win) ? scaleFactorOf(win) : 1;
    views.push({
      id: view.id,
      title: windowTitle(view),
      windowId: systemWindowId(win),
      scale: sf === 1 ? null : retinaDouble ? 1 : 1 / sf,
      sources: windowSources(view),
      allRegionSources: view.regions.map((r) => r.obsSource).filter(Boolean),
      crop: barCrop(win),
      muted: Boolean(view.muted),
      regions: regions.filter((r) => r.enabled).map((r) => ({ name: r.name, obsSource: r.obsSource, crop: cropFor(win, r) })),
    });
  }
  for (const app of configStore.get().appWindows) {
    views.push({
      id: `app:${app.id}`,
      match: { app: app.matchApp, title: app.matchTitle, label: app.windowLabel },
      title: '',
      windowId: null,
      scale: null,
      sources: [app.sourceName],
      regions: [],
      crop: app.crop,
      showCursor: app.showCursor,
      // muted deliberately absent -- not our window, not our call (see syncViews).
    });
  }
  const report = await obs.syncViews(views, force);
  appWindowResolved = report.resolved || {};
  appWindowMatched = report.matchedLabels || {};
  // A routine sync doesn't change connection *state*, so the 'status'
  // listener's own logActivity call (state-change only, to avoid spam on
  // every poll) never sees this -- log it here instead, and only when there
  // was actually something to report, same reasoning: a no-op sync (the
  // common case, firing on every view/region edit via obsSyncTimer) would
  // otherwise flood the Connections activity log on every keystroke-level
  // change.
  const bits = [];
  if (report.pointed.length) bits.push(`re-pointed ${report.pointed.join(', ')}`);
  if (report.restarted.length) bits.push(`restarted capture of ${report.restarted.join(', ')}`);
  if (report.cropped.length) bits.push(`cropped ${report.cropped.join(', ')}`);
  if (report.detected.length) bits.push(`linked ${report.detected.map((d) => d.input).join(', ')}`);
  if (report.missing.length) bits.push(`missing in OBS: ${report.missing.join(', ')}`);
  if (bits.length) logActivity('OBS', `Synced sources: ${bits.join('; ')}.`, 'info');
  const known = new Set(obs.status().inputs);
  let adopted = false;
  for (const { id, input } of report.detected) {
    const view = configStore.getView(id);
    if (!view || !view.windowSource.enabled || known.has(view.windowSource.name)) continue;
    configStore.updateView(id, { windowSource: { ...view.windowSource, name: input } });
    adopted = true;
  }
  // A second pass points and crops what was just adopted; it adopts nothing
  // more since the names are known now.
  if (adopted) return syncObs();
  broadcastStatus();
  return report;
}

function scheduleObsSync() {
  clearTimeout(obsSyncTimer);
  obsSyncTimer = setTimeout(() => syncObs().catch((err) => console.warn(`[obs] sync failed: ${err.message}`)), 800);
}

function createViewWindow(view) {
  const existing = viewWindows.get(view.id);
  if (isAlive(existing)) {
    existing.show();
    return existing;
  }

  const options = {
    title: windowTitle(view),
    width: view.width,
    height: view.height + BAR_HEIGHT,
    useContentSize: true,
    // Borderless: the window is the app's bar plus the page, nothing else.
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#1a1410',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'bar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (Number.isInteger(view.x) && Number.isInteger(view.y)) {
    options.x = view.x;
    options.y = view.y;
  }

  const win = new BrowserWindow(options);
  viewWindows.set(view.id, win);

  // The bar is the window's own page; Foundry renders in a child view below it.
  win.loadFile(path.join(__dirname, 'bar', 'index.html'));
  win.webContents.on('did-finish-load', () => sendBarState(view.id));
  // Keep our stable title so the window is easy to find in OBS.
  win.on('page-title-updated', (event) => event.preventDefault());

  configureSession(partitionFor(view));
  const page = new WebContentsView({
    webPreferences: {
      partition: partitionFor(view),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  pageViews.set(view.id, page);
  win.contentView.addChildView(page);
  page.setBackgroundColor('#000000');
  layoutPage(view.id);
  const wc = page.webContents;

  const showView = () => {
    if (!isAlive(win) || win.isVisible()) return;
    win.show();
    freshlyShown.add(view.id);
    broadcastStatus();
    scheduleObsSync();
  };

  // Anything Foundry tries to open in a new window goes to the default browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-finish-load', broadcastStatus);
  // Browsers keep a page silent until the user interacts with it, and
  // Foundry waits for that first gesture before starting its audio. The
  // page reports "loaded" long before Foundry has finished setting up (a
  // scene can take half a minute), and Foundry ignores clicks until then,
  // so the wake waits for Foundry to say it is ready.
  wc.on('did-finish-load', () => {
    const current = configStore.getView(view.id);
    if (!current || !current.wakeAudio) return;
    wakeWhenReady(view.id);
  });
  wc.on('did-start-loading', () => stopWake(view.id));
  wc.on('audio-state-changed', broadcastStatus);
  wc.on('did-start-loading', broadcastStatus);
  wc.on('did-stop-loading', broadcastStatus);
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 is ERR_ABORTED, e.g. a redirect.
    console.warn(`[${view.id}] Failed to load ${url}: ${description} (${code})`);
    broadcastStatus();
  });
  wc.on('render-process-gone', (_event, details) => {
    console.warn(`[${view.id}] Renderer gone (${details.reason}), reloading.`);
    if (!wc.isDestroyed()) wc.reload();
  });
  wc.setAudioMuted(Boolean(view.muted));

  win.on('move', () => sendBarState(view.id));
  win.on('moved', () => {
    if (!isAlive(win) || parking) return;
    if (parked.has(view.id)) {
      // Dragged out of its parking spot: no longer collapsed.
      parked.delete(view.id);
      if (parked.size === 0) collapsed = false;
      buildMenu();
    }
    const [x, y] = win.getPosition();
    configStore.updateView(view.id, { x, y });
    broadcastStatus();
  });
  win.on('resize', () => {
    layoutPage(view.id);
    sendBarState(view.id);
    broadcastStatus();
    scheduleObsSync();
  });
  win.on('closed', () => {
    stopWake(view.id);
    viewWindows.delete(view.id);
    pageViews.delete(view.id);
    parked.delete(view.id);
    collapsed = parked.size > 0;
    if (!wc.isDestroyed()) wc.close();
    broadcastStatus();
  });

  win.once('ready-to-show', showView);
  // Safety net: never leave a window invisible if the bar page stalls.
  setTimeout(showView, 5000);

  wc.loadURL(view.url || PLACEHOLDER_URL);
  broadcastStatus();
  return win;
}

// Push the saved size/position/mute into an already-open window.
function applyViewSettings(view) {
  const win = viewWindows.get(view.id);
  if (!isAlive(win)) return;
  if (win.getTitle() !== windowTitle(view)) win.setTitle(windowTitle(view));
  const [w, h] = pageSize(win);
  if (w !== view.width || h !== view.height) {
    win.setContentSize(view.width, view.height + BAR_HEIGHT);
  }
  if (Number.isInteger(view.x) && Number.isInteger(view.y) && !parked.has(view.id)) {
    const [x, y] = win.getPosition();
    if (x !== view.x || y !== view.y) win.setPosition(view.x, view.y);
  }
  sendBarState(view.id);
  const wc = pageOf(view.id);
  if (!wc) return;
  wc.setAudioMuted(Boolean(view.muted));
  const target = view.url || PLACEHOLDER_URL;
  const current = wc.getURL();
  const currentIsPlaceholder = current.startsWith('data:');
  if (view.url ? currentIsPlaceholder || current !== view.url : !currentIsPlaceholder) {
    wc.loadURL(target);
  }
}

// Resize the page area from the bar (arrow keys), keeping the top-left corner.
function resizePage(id, dw, dh) {
  const win = viewWindows.get(id);
  if (!isAlive(win)) return;
  const clamp = (n) => Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, n));
  const [w, h] = pageSize(win);
  const width = clamp(w + dw);
  const height = clamp(h + dh);
  if (width === w && height === h) return;
  win.setContentSize(width, height + BAR_HEIGHT);
  configStore.updateView(id, { width, height });
  broadcastStatus();
}

function closeView(id) {
  const win = viewWindows.get(id);
  if (isAlive(win)) win.close();
}

function reloadView(id) {
  const wc = pageOf(id);
  if (wc) wc.reloadIgnoringCache();
}

// View id for a BrowserWindow (a view window or null for the control panel).
function viewIdOf(win) {
  for (const [id, w] of viewWindows) if (w === win) return id;
  return null;
}

// Centre the window on the display it is currently on and bring it forward.
function resetView(id) {
  const view = getView(id);
  const win = viewWindows.get(id);
  if (!isAlive(win)) return;
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const x = Math.round(area.x + (area.width - view.width) / 2);
  const y = Math.round(area.y + (area.height - view.height - BAR_HEIGHT) / 2);
  parked.delete(id);
  configStore.updateView(id, { x, y });
  applyViewSettings(getView(id));
  win.show();
  win.focus();
  win.moveTop();
  broadcastStatus();
}

function resolveDisplay(displayId) {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

// Lay the windows out left to right from the top-left of the display,
// wrapping to a new row when the next one would not fit. A parked window
// isn't actually moved by this (applyViewSettings skips repositioning
// anything parked, so it would silently record a new x/y that never takes
// visual effect) -- undock everything first so the arrange is real.
function arrangeViews(displayId) {
  if (parked.size > 0) expandViews();
  const display = resolveDisplay(displayId);
  const area = display.workArea;
  let x = area.x;
  let y = area.y;
  let rowHeight = 0;
  for (const view of configStore.get().views) {
    if (x > area.x && x + view.width > area.x + area.width) {
      x = area.x;
      y += rowHeight;
      rowHeight = 0;
    }
    configStore.updateView(view.id, { x, y });
    x += view.width;
    rowHeight = Math.max(rowHeight, view.height + BAR_HEIGHT);
  }
  configStore.get().views.forEach(applyViewSettings);
  broadcastStatus();
}

function addView() {
  const view = configStore.addView();
  if (!view) throw new Error(`At most ${LIMITS.maxViews} windows.`);
  buildMenu();
  broadcastStatus();
  return view;
}

function removeView(id) {
  closeView(id);
  const removed = configStore.removeView(id);
  if (!removed) throw new Error('The last window cannot be removed.');
  parked.delete(id);
  buildMenu();
  broadcastStatus();
  return configStore.get();
}

// ---------------------------------------------------------------------------
// Parking (the edge dock)
// ---------------------------------------------------------------------------

function dockDisplay() {
  const wanted = configStore.get().arrangeDisplayId;
  return screen.getAllDisplays().find((d) => d.id === wanted) || screen.getPrimaryDisplay();
}

// The edge a display parks toward: an edge with no display beyond it, so a
// parked window never spills onto another monitor (which would change its
// scale factor and therefore its captured size).
function parkingEdgeFor(display) {
  return parkingGeometry.parkingEdge(display, screen.getAllDisplays(), configStore.get().dock.side);
}

// Where a window goes when parked: hanging off its display's parking edge,
// keeping DOCK_WIDTH points on screen so OBS keeps capturing it.
function parkedPosition(win) {
  const display = screen.getDisplayMatching(win.getBounds());
  const [w, h] = win.getContentSize();
  const [x, y] = win.getPosition();
  return parkingGeometry.parkedPosition(parkingEdgeFor(display), display.workArea, x, y, w, h, configStore.get().dock.overlap);
}

async function parkView(id) {
  const win = viewWindows.get(id);
  if (!isAlive(win) || parked.has(id)) return;
  let thumb = '';
  const wc = pageOf(id);
  if (wc) {
    try {
      const image = await wc.capturePage();
      thumb = image.resize({ width: 220 }).toDataURL();
    } catch (err) {
      thumb = '';
    }
  }
  if (!isAlive(win)) return;
  const [x, y] = win.getPosition();
  const displayId = screen.getDisplayMatching(win.getBounds()).id;
  parked.set(id, { x, y, thumb, displayId });
  parking = true;
  const target = parkedPosition(win);
  win.setPosition(target.x, target.y);
  setTimeout(() => {
    parking = false;
  }, 300);
  collapsed = parked.size > 0;
  buildMenu();
  layoutDock();
  broadcastStatus();
}

function restoreView(id) {
  const entry = parked.get(id);
  const win = viewWindows.get(id);
  if (!entry) return;
  parked.delete(id);
  if (isAlive(win)) {
    parking = true;
    win.setPosition(entry.x, entry.y);
    win.moveTop();
    setTimeout(() => {
      parking = false;
    }, 300);
  }
  collapsed = parked.size > 0;
  buildMenu();
  layoutDock();
  broadcastStatus();
}

async function collapseViews() {
  for (const id of viewWindows.keys()) await parkView(id);
}

function expandViews() {
  for (const id of [...parked.keys()]) restoreView(id);
}

// --- Dock window and cover strips ---

// The dock pill is sized to its contents and centred on the display edge.
// The dock window always has the expanded size and is click-through while
// the pill is collapsed; the pill itself grows and shrinks inside it with a
// CSS transition, so hovering never resizes a window.
function dockSize(expanded) {
  const n = configStore.get().views.length;
  if (!expanded) return { width: DOCK_WIDTH, height: 92 + n * 16 };
  return { width: DOCK_EXPANDED, height: 200 + n * 182 };
}

function dockBounds(display) {
  return parkingGeometry.pillBounds(configStore.get().dock.side, display.workArea, dockSize(true));
}

function edgeWindowOptions(extra) {
  return {
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    ...extra,
  };
}

function dockState() {
  return {
    side: configStore.get().dock.side,
    collapsed: dockSize(false),
    obsConnected: obs.connected,
    outputs: obs.status().outputs,
    windows: configStore.get().views.map((view) => {
      const win = viewWindows.get(view.id);
      const open = isAlive(win);
      const entry = parked.get(view.id);
      const [width, height] = open ? pageSize(win) : [view.width, view.height];
      const edge = open ? parkingEdgeFor(screen.getDisplayMatching(win.getBounds())) : null;
      return {
        id: view.id,
        label: view.label,
        open,
        parked: Boolean(entry),
        thumb: entry ? entry.thumb : '',
        width,
        height,
        edge,
        sources: windowSources(view),
      };
    }),
  };
}

function sendDockState() {
  if (isAlive(dockWindow) && !dockWindow.webContents.isDestroyed()) dockWindow.webContents.send('dock:state', dockState());
}

// Thin cover strips hide the parked slivers along the edge each display
// parks toward, only while something is parked there.
function layoutDock() {
  if (!isAlive(dockWindow)) return;
  dockWindow.setBounds(dockBounds(dockDisplay()), false);

  const overlap = configStore.get().dock.overlap;
  const parkedOn = new Set([...parked.values()].map((p) => p.displayId));
  const wanted = new Map();
  for (const d of screen.getAllDisplays()) {
    if (!parkedOn.has(d.id) || overlap <= 0) continue; // fully off screen needs no cover
    wanted.set(d.id, parkingGeometry.stripBounds(parkingEdgeFor(d), d.workArea, overlap));
  }
  for (const [id, strip] of coverStrips) {
    if (!wanted.has(id)) {
      if (isAlive(strip)) strip.destroy();
      coverStrips.delete(id);
    }
  }
  for (const [id, bounds] of wanted) {
    let strip = coverStrips.get(id);
    if (!isAlive(strip)) {
      strip = new BrowserWindow(edgeWindowOptions({ focusable: false, ...bounds }));
      strip.setAlwaysOnTop(true, 'floating');
      strip.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      strip.loadURL('data:text/html,<body style="margin:0;height:100vh;background:%23120d0a"></body>');
      coverStrips.set(id, strip);
    }
    strip.setBounds(bounds, false);
    strip.showInactive();
  }
}

function setupDock() {
  const { enabled } = configStore.get().dock;
  if (!enabled) {
    if (isAlive(dockWindow)) dockWindow.destroy();
    dockWindow = null;
    for (const strip of coverStrips.values()) if (isAlive(strip)) strip.destroy();
    coverStrips.clear();
    return;
  }
  if (!isAlive(dockWindow)) {
    dockWindow = new BrowserWindow(
      edgeWindowOptions({
        title: `${APP_NAME} Dock`,
        ...dockBounds(dockDisplay()),
        webPreferences: {
          preload: path.join(__dirname, 'dock-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: false,
        },
      }),
    );
    dockWindow.setAlwaysOnTop(true, 'floating');
    dockWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Click-through until the pointer reaches the pill; the page still sees
    // the pointer move so it knows when that happens.
    dockWindow.setIgnoreMouseEvents(true, { forward: true });
    dockWindow.on('page-title-updated', (event) => event.preventDefault());
    dockWindow.loadFile(path.join(__dirname, 'dock', 'index.html'));
    dockWindow.webContents.on('did-finish-load', sendDockState);
    dockWindow.once('ready-to-show', () => {
      if (isAlive(dockWindow)) dockWindow.showInactive();
    });
    dockWindow.on('closed', () => {
      dockWindow = null;
    });
  }
  layoutDock();
}

// Start every window that has a URL. The per-window "start on launch" flag
// only applies to app launch (see openLaunchViews below).
function openAllViews() {
  configStore
    .get()
    .views.filter((v) => v.url)
    .forEach((v) => createViewWindow(v));
}

// Start every window ticked Start on launch; those ticked Dock on launch
// slide into the dock once their page has loaded.
function openLaunchViews() {
  for (const v of configStore.get().views.filter((v) => v.enabled && v.url)) {
    createViewWindow(v);
    if (!v.dockOnLaunch) continue;
    const wc = pageOf(v.id);
    if (!wc) continue;
    let done = false;
    const dock = () => {
      if (done) return;
      done = true;
      parkView(v.id).catch(() => {});
    };
    wc.once('did-finish-load', () => setTimeout(dock, 1500)); // a moment for the page to paint its thumbnail
    setTimeout(dock, 20000); // a page that never finishes loading still docks
  }
}

function closeAllViews() {
  for (const win of viewWindows.values()) {
    if (isAlive(win)) win.close();
  }
}

// ---------------------------------------------------------------------------
// Control panel window
// ---------------------------------------------------------------------------

function createControlWindow() {
  if (isAlive(controlWindow)) {
    controlWindow.show();
    controlWindow.focus();
    return controlWindow;
  }
  // Open where it was last left, as long as that spot is still on a display.
  const remembered = configStore.get().panel;
  const onScreen = remembered && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return remembered.x < a.x + a.width - 80 && remembered.x + remembered.width > a.x + 80 && remembered.y >= a.y - 20 && remembered.y < a.y + a.height - 80;
  });
  const placement = onScreen ? remembered : { width: 880, height: 760 };
  controlWindow = new BrowserWindow({
    title: `${APP_NAME} - Control Panel - ${REVISION}`,
    ...placement,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#1a1410',
    // The native title bar was its own separate, system-colored strip above
    // the app's own dark .topbar (which already has -webkit-app-region:
    // drag set up for exactly this); hiddenInset keeps the traffic lights
    // but folds the bar itself into the page's own background.
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  controlWindow.loadFile(path.join(__dirname, 'control', 'index.html'));
  controlWindow.once('ready-to-show', () => controlWindow.show());
  // Closing the panel hides it; the app keeps running so OBS keeps its sources.
  controlWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      controlWindow.hide();
    }
  });
  // Remember size and position, a moment after the last move or resize.
  let panelTimer = null;
  const rememberPanel = () => {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => {
      if (!isAlive(controlWindow) || controlWindow.isMinimized()) return;
      const current = configStore.get();
      configStore.save({ ...current, panel: controlWindow.getBounds() });
    }, 400);
  };
  controlWindow.on('move', rememberPanel);
  controlWindow.on('resize', rememberPanel);
  controlWindow.on('closed', () => {
    clearTimeout(panelTimer);
    controlWindow = null;
  });
  return controlWindow;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function buildMenu() {
  const views = configStore.get().views;
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Control Panel',
          accelerator: 'CmdOrCtrl+0',
          click: () => createControlWindow(),
        },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [{ role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }] : []),
        { role: 'quit' },
      ],
    },
    {
      // Copy/paste must work for typing the Foundry password.
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Views',
      submenu: [
        ...views.map((view, index) => ({
          label: `Open ${view.label}`,
          accelerator: `CmdOrCtrl+${index + 1}`,
          click: () => createViewWindow(getView(view.id)),
        })),
        { type: 'separator' },
        ...views.map((view, index) => ({
          label: `Reload ${view.label}`,
          accelerator: `CmdOrCtrl+Shift+${index + 1}`,
          click: () => reloadView(view.id),
        })),
        { type: 'separator' },
        { label: 'Open All', click: () => openAllViews() },
        { label: 'Close All', click: () => closeAllViews() },
        { type: 'separator' },
        {
          label: collapsed ? 'Undock Windows' : 'Dock Windows',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => (collapsed ? expandViews() : collapseViews()),
        },
        { type: 'separator' },
        {
          label: 'Reload Focused Window',
          accelerator: 'CmdOrCtrl+R',
          click: (_item, win) => {
            if (!isAlive(win)) return;
            const id = viewIdOf(win);
            if (id) reloadView(id);
            else win.webContents.reload();
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: (_item, win) => {
            if (!isAlive(win)) return;
            const id = viewIdOf(win);
            const wc = id ? pageOf(id) : win.webContents;
            if (wc) wc.toggleDevTools();
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Menu bar icon (optional)
// ---------------------------------------------------------------------------

function trayMenuTemplate() {
  const views = configStore.get().views;
  return [
    { label: `${APP_NAME} ${REVISION}`, enabled: false },
    { type: 'separator' },
    { label: 'Show Control Panel', click: () => createControlWindow() },
    { type: 'separator' },
    ...views.map((view) => {
      const open = isAlive(viewWindows.get(view.id));
      return {
        label: `${open ? 'Stop' : 'Start'} ${view.label}`,
        enabled: open || Boolean(view.url),
        click: () => (open ? closeView(view.id) : createViewWindow(getView(view.id))),
      };
    }),
    { label: 'Start All', click: () => openAllViews() },
    { label: 'Stop All', click: () => closeAllViews() },
    { type: 'separator' },
    {
      label: 'Wake Audio',
      enabled: viewWindows.size > 0,
      click: () => {
        for (const id of viewWindows.keys()) {
          if (wakeAudio(id)) wakeWhenReady(id, 5000);
        }
        setTimeout(broadcastStatus, 800);
      },
    },
    { label: 'Auto Arrange on Display', click: () => arrangeViews(configStore.get().arrangeDisplayId) },
    { type: 'separator' },
    {
      label: collapsed ? 'Undock Windows' : 'Dock Windows',
      enabled: viewWindows.size > 0,
      click: () => (collapsed ? expandViews() : collapseViews()),
    },
    {
      label: 'Sync OBS Sources',
      enabled: obs.connected,
      click: () => syncObs().catch(() => {}),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate()));
}

function setupTray() {
  const { menuBarIcon, hideDockIcon } = configStore.get();
  if (menuBarIcon && !tray) {
    // A template image -- macOS renders it as a plain black/white
    // silhouette from its alpha channel alone, auto-tinting it to match
    // the menu bar's own light/dark state, the same as every other native
    // menu bar icon. Tried a real colored icon here briefly; reverted --
    // a fixed color stood out against the monochrome icons everyone else's
    // menu bar extras use, rather than reading as "a normal part of the
    // menu bar." `@2x` is picked up automatically by nativeImage from the
    // file alongside this one.
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip(APP_NAME);
    tray.on('double-click', () => createControlWindow());
    refreshTrayMenu();
  } else if (!menuBarIcon && tray) {
    tray.destroy();
    tray = null;
  }
  if (process.platform === 'darwin' && app.dock) {
    if (menuBarIcon && hideDockIcon) app.dock.hide();
    else app.dock.show();
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('config:get', () => configStore.get());
  ipcMain.handle('config:save', (_event, next) => {
    // The window source has its own channel (windowSource:set) that also
    // renames the source in OBS; a stale copy from the panel must not undo that.
    const current = configStore.get();
    const input = next && typeof next === 'object' ? next : {};
    const views = Array.isArray(input.views)
      ? input.views.map((v) => {
          const stored = v && typeof v === 'object' ? current.views.find((c) => c.id === v.id) : null;
          return stored ? { ...v, windowSource: stored.windowSource } : v;
        })
      : input.views;
    const saved = configStore.save({ ...input, views });
    saved.views.forEach(applyViewSettings);
    setupTray();
    setupDock();
    buildMenu();
    scheduleObsSync();
    broadcastStatus();
    return saved;
  });
  ipcMain.handle('config:reset', () => {
    const saved = configStore.save({});
    saved.views.forEach(applyViewSettings);
    setupTray();
    setupDock();
    buildMenu();
    scheduleObsSync();
    broadcastStatus();
    return saved;
  });
  ipcMain.handle('views:add', () => addView());
  ipcMain.handle('views:remove', (_event, id) => removeView(id));
  ipcMain.handle('views:collapse', () => collapseViews());
  ipcMain.handle('views:expand', () => expandViews());
  ipcMain.handle('views:park', (_event, id) => parkView(id));
  ipcMain.handle('views:restore', (_event, id) => restoreView(id));

  ipcMain.on('dock:hover', (_event, expanded) => {
    dockExpanded = Boolean(expanded);
    if (isAlive(dockWindow)) dockWindow.setIgnoreMouseEvents(!dockExpanded, { forward: true });
  });
  ipcMain.on('dock:toggle', (_event, id) => {
    if (!configStore.getView(id)) return;
    if (parked.has(id)) restoreView(id);
    else if (isAlive(viewWindows.get(id))) parkView(id);
    else createViewWindow(getView(id));
  });
  ipcMain.on('dock:parkAll', () => collapseViews());
  ipcMain.on('dock:restoreAll', () => expandViews());
  ipcMain.on('dock:action', (_event, name) => {
    if (name === 'startAll') openAllViews();
    else if (name === 'stopAll') closeAllViews();
    else if (name === 'sync') syncObs().catch(() => {});
    else if (name === 'panel') createControlWindow();
    else if (name === 'wakeAudio') {
      for (const id of viewWindows.keys()) {
        if (wakeAudio(id)) wakeWhenReady(id, 5000);
      }
      setTimeout(broadcastStatus, 800);
    } else if (name === 'arrange') arrangeViews(configStore.get().arrangeDisplayId);
  });

  // --- OBS ---
  ipcMain.handle('obs:setSettings', async (_event, settings) => {
    const current = configStore.get();
    configStore.save({ ...current, obs: { ...current.obs, ...settings } });
    // Turning auto-connect on while offline connects right away.
    if (configStore.get().obs.autoConnect && !obs.connected) await obs.connect().catch(() => {});
    broadcastStatus();
    return fullStatus().obs;
  });
  ipcMain.handle('obs:setPassword', async (_event, password) => {
    writeObsPassword(password);
    broadcastStatus();
    return fullStatus().obs;
  });
  ipcMain.handle('obs:connect', async () => {
    await obs.connect();
    return fullStatus().obs;
  });
  ipcMain.handle('obs:disconnect', async () => {
    await obs.disconnect();
    return fullStatus().obs;
  });
  ipcMain.handle('obs:sync', () => syncObs());
  ipcMain.handle('obs:listScenes', () => obs.listScenes());
  ipcMain.handle('obs:listSources', () => obs.listSourceNames());
  ipcMain.handle('obs:setScene', (_event, sceneName) => obs.setCurrentScene(sceneName));
  ipcMain.handle('obs:startRecording', () => obs.startRecording());
  ipcMain.handle('obs:pauseRecording', () => obs.pauseRecording());
  ipcMain.handle('obs:resumeRecording', () => obs.resumeRecording());
  ipcMain.handle('obs:stopRecording', () => obs.stopRecording());
  ipcMain.handle('obs:startStreaming', () => obs.startStreaming());
  ipcMain.handle('obs:stopStreaming', () => obs.stopStreaming());
  // --- The whole window as an OBS source ---
  // Saves the switch and the name. Switching off hides the source in OBS
  // and stops maintaining it; renaming while the source exists in OBS renames
  // it there too, so the capture and its crop filter carry over.
  ipcMain.handle('windowSource:set', async (_event, id, patch) => {
    const view = getView(id);
    const src = patch && typeof patch === 'object' ? patch : {};
    const previous = view.windowSource;
    const next = {
      enabled: src.enabled === undefined ? previous.enabled : Boolean(src.enabled),
      name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 200) : previous.name,
    };
    const inOtherUse = configStore
      .get()
      .views.some((v) => (v.id !== id && v.windowSource.name === next.name) || v.regions.some((r) => r.obsSource === next.name));
    if (next.name !== previous.name && inOtherUse) throw new Error(`"${next.name}" is already used by another window or region.`);
    const saved = configStore.updateView(id, { windowSource: next }).views.find((v) => v.id === id).windowSource;
    if (obs.connected) {
      const inputs = obs.status().inputs;
      if (saved.name !== previous.name && inputs.includes(previous.name) && !inputs.includes(saved.name)) {
        await obs.renameInput(previous.name, saved.name).catch((err) => console.warn(`[obs] rename: ${err.message}`));
        await obs.refreshInputs().catch(() => {});
      }
      if (saved.enabled !== previous.enabled && obs.status().inputs.includes(saved.name)) {
        await obs.setSourceVisible(saved.name, saved.enabled).catch((err) => console.warn(`[obs] visibility: ${err.message}`));
      }
    }
    scheduleObsSync();
    broadcastStatus();
    return saved;
  });
  // Creates the window's source in OBS under its name. A source that already
  // exists with that name (made by hand in OBS) is simply taken over.
  ipcMain.handle('windowSource:add', async (_event, id) => {
    const view = getView(id);
    const { name } = view.windowSource;
    const win = viewWindows.get(id);
    const windowId = systemWindowId(win);
    if (!windowId) throw new Error('Start the window first so OBS can capture it.');
    if (!obs.status().inputs.includes(name)) await obs.createInput(name, windowId);
    await obs.ensureCropFilter(name, barCrop(win));
    if (!view.windowSource.enabled) configStore.updateView(id, { windowSource: { ...view.windowSource, enabled: true } });
    scheduleObsSync();
    broadcastStatus();
    return name;
  });
  // --- App windows (other applications' windows captured into OBS) ---
  // OBS's own list of capturable windows, for the picker. Needs OBS
  // connected AND at least one existing window-capture source to read the
  // list from (OBS only exposes it through an existing input).
  ipcMain.handle('appWindows:list', async () => {
    if (!obs.connected) throw new Error('Connect to OBS first -- its window list is where this comes from.');
    const choices = await obs.windowChoices();
    if (!choices.length) {
      throw new Error('OBS returned no windows. This needs at least one macOS Screen Capture (window) source to exist already -- add any window source first, then refresh.');
    }
    return choices
      .filter((c) => typeof c.itemName === 'string' && c.itemName.trim())
      .map((c) => ({ label: c.itemName, ...parseWindowChoice(c.itemName) }));
  });
  // Creates the app window's source in OBS pointed at whichever window its
  // match rule finds right now. A source already existing under that name
  // (made by hand) is taken over, same as a web window's.
  ipcMain.handle('appWindows:add', async (_event, id) => {
    const app = configStore.get().appWindows.find((a) => a.id === id);
    if (!app) throw new Error('Unknown app window.');
    if (!obs.connected) throw new Error('Connect to OBS first.');
    if (!app.matchApp && !app.matchTitle) throw new Error('Pick a window (or fill in the app/title match) first.');
    const windowId = await obs.findAppWindowId({ app: app.matchApp, title: app.matchTitle, label: app.windowLabel });
    if (!windowId) throw new Error(`No open window matches "${[app.matchApp, app.matchTitle].filter(Boolean).join(' / ')}" -- open it, then try again.`);
    if (!obs.status().inputs.includes(app.sourceName)) await obs.createInput(app.sourceName, windowId, { showCursor: app.showCursor });
    scheduleObsSync();
    broadcastStatus();
    return app.sourceName;
  });
  // Renames the app window's OBS source (and the saved name) -- refuses a
  // name another window, region or app window already owns.
  ipcMain.handle('appWindows:rename', async (_event, id, name) => {
    const current = configStore.get();
    const app = current.appWindows.find((a) => a.id === id);
    if (!app) throw new Error('Unknown app window.');
    const next = typeof name === 'string' ? name.trim().slice(0, 200) : '';
    if (!next) throw new Error('A source name is required.');
    const taken =
      current.views.some((v) => v.windowSource.name === next || v.regions.some((r) => r.obsSource === next)) ||
      current.appWindows.some((a) => a.id !== id && a.sourceName === next);
    if (taken) throw new Error(`"${next}" is already used by another window, region or app window.`);
    const saved = configStore.save({ ...current, appWindows: current.appWindows.map((a) => (a.id === id ? { ...a, sourceName: next } : a)) });
    if (obs.connected) {
      const inputs = obs.status().inputs;
      if (inputs.includes(app.sourceName) && !inputs.includes(next)) {
        await obs.renameInput(app.sourceName, next).catch((err) => console.warn(`[obs] rename: ${err.message}`));
        await obs.refreshInputs().catch(() => {});
      }
    }
    scheduleObsSync();
    broadcastStatus();
    return saved.appWindows;
  });
  // --- Tavern ---
  ipcMain.handle('tavern:setSettings', async (_event, settings) => {
    const current = configStore.get();
    const previous = current.tavern;
    const saved = configStore.save({ ...current, tavern: { ...previous, ...settings } });
    const next = saved.tavern;
    if (tavern.connected && (!next.enabled || next.url !== previous.url || next.login !== previous.login)) {
      await tavern.disconnect();
    }
    if (next.enabled && next.autoConnect && !tavern.connected && next.url) await tavern.connect().catch(() => {});
    // Size changes reach every published source.
    await syncTavern().catch(() => {});
    broadcastStatus();
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:setPassword', async (_event, password) => {
    writeSecret(TAVERN_SECRET_PATH, password);
    if (tavern.connected) await tavern.disconnect();
    const t = configStore.get().tavern;
    if (t.enabled && t.autoConnect) await tavern.connect().catch(() => {});
    broadcastStatus();
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:connect', async () => {
    await tavern.connect();
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:disconnect', async () => {
    await tavern.disconnect();
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:sync', () => syncTavern());
  ipcMain.handle('tavern:publishAll', async () => {
    for (const user of tavern.membersOf(configStore.get().tavern.space)) {
      const entry = playerEntry(configStore.get().tavern, user.key);
      if (!isPublished(entry) && (entry.player || entry.character)) await publishPlayer(user.key);
    }
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:unpublishAll', async (_event, removeFromObs) => {
    for (const key of Object.keys(configStore.get().tavern.players)) await unpublishPlayer(key, removeFromObs !== false);
    return fullStatus().tavern;
  });
  // Hide/Show all: the room's current members only (like Publish all), and
  // visibility-only -- unlike Publish/Unpublish all, nothing is created or
  // deleted, so a broken source elsewhere is never touched by mistake.
  ipcMain.handle('tavern:hideAll', async () => {
    for (const user of tavern.membersOf(configStore.get().tavern.space)) {
      const entry = playerEntry(configStore.get().tavern, user.key);
      const wanted = {};
      if (entry.player) wanted.player = false;
      if (entry.character) wanted.character = false;
      if (Object.keys(wanted).length) await applyPublish(user.key, wanted).catch(() => {});
    }
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:showAll', async () => {
    for (const user of tavern.membersOf(configStore.get().tavern.space)) {
      const entry = playerEntry(configStore.get().tavern, user.key);
      const wanted = {};
      if (entry.source && !entry.player) wanted.player = true;
      if (entry.characterSource && !entry.character) wanted.character = true;
      if (Object.keys(wanted).length) await applyPublish(user.key, wanted).catch(() => {});
    }
    return fullStatus().tavern;
  });
  ipcMain.handle('tavern:setChoice', (_event, key, field, on) => setChoice(String(key), String(field), Boolean(on)));
  ipcMain.handle('tavern:viewUrl', (_event, key, kind) => {
    const user = tavern.party.find((u) => u.key === key);
    if (!user) throw new Error('Unknown user.');
    return kind === 'character' ? tavernCharacterSource(user).url : tavernPlayerSource(user).url;
  });
  ipcMain.handle('tavern:openManage', () => {
    const { url } = configStore.get().tavern;
    if (url) shell.openExternal(`${url}/admin`);
  });
  // --- Automations ---
  ipcMain.handle('automations:setSettings', async (_event, settings) => {
    const current = configStore.get();
    configStore.save({ ...current, automations: { ...current.automations, ...settings } });
    await syncAutomationsServer();
    broadcastStatus();
    return fullStatus().automations;
  });
  // Feeds a synthetic event through the exact same recordEvent() a real
  // Herald POST uses, so the automations.on('event', ...) listener runs the
  // same rule-matching path -- lets the tab be exercised end to end without
  // Foundry or Herald in the loop. Fire-and-forget, same as a real call:
  // rule failures are logged, not thrown back at the caller. `prompts` gets
  // the exact same synchronous gate the real HTTP endpoint does
  // (checkAndApplyPrompts) -- Studio's own Run Automation button is not a
  // side door around a rule set's prompt requirements, and the renderer
  // (buildStepRow's Run Automation click handler) already collects answers
  // before calling this, same as it already collects test data for an
  // externally-registered field.
  ipcMain.handle('automations:testEvent', (_event, eventName, data, prompts) => {
    const event = typeof eventName === 'string' ? eventName.trim().slice(0, 60) : '';
    if (!event) throw new Error('Enter an event name.');
    const result = checkAndApplyPrompts(event, prompts && typeof prompts === 'object' ? prompts : {});
    if (!result.ok) throw new Error(result.error);
    automations.recordEvent(event, data && typeof data === 'object' ? data : {});
    return fullStatus().automations;
  });
  // The Automations tab's Run/Stop toggle, once a rule set is already
  // running -- see cancelRuleSetRun. A no-op, not an error, if the rule set
  // isn't actually running (a stop click racing the run's own natural end).
  ipcMain.handle('automations:cancelRuleSet', (_event, id) => {
    cancelRuleSetRun(String(id || ''));
    return fullStatus().automations;
  });
  // Runs one stage's worth of steps on demand (the Automations tab's own
  // "Time it" button, which fires a delay step's preceding action so the
  // user can watch it happen and measure how long the delay should
  // actually be). The exact same runAutomationAction a real rule set uses;
  // errors are thrown back to the caller here, unlike a real trigger, since
  // there is a person at the control panel waiting to see whether it worked.
  ipcMain.handle('automations:runSteps', async (_event, steps) => {
    const list = Array.isArray(steps) ? steps : [];
    // No real triggering event during a manual test -- a timed setText
    // step set to "literal" or "file" still runs correctly (neither needs
    // one), only "dataField" reads blank, since there is genuinely no
    // live data to pull from outside a real trigger.
    await Promise.all(list.map((s) => runAutomationAction(s && s.action, s && s.param, undefined, s)));
  });
  // A setText step's "File" value type: browse for the local text file
  // Studio will re-read every time that step runs. Returns the picked
  // path, or null if the user cancelled.
  ipcMain.handle('automations:pickTextFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(controlWindow, {
      title: 'Choose a text file',
      properties: ['openFile'],
      filters: [
        { name: 'Text files', extensions: ['txt', 'md', 'log'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return canceled || !filePaths.length ? null : filePaths[0];
  });
  // --- YouTube ---
  ipcMain.handle('youtube:setSettings', async (_event, settings) => {
    const current = configStore.get();
    configStore.save({ ...current, youtube: { ...current.youtube, ...settings } });
    broadcastStatus();
    return fullStatus().youtube;
  });
  ipcMain.handle('youtube:setClientSecret', (_event, secret) => {
    writeYoutubeSecret({ clientSecret: typeof secret === 'string' ? secret : '' });
    broadcastStatus();
    return fullStatus().youtube;
  });
  // Step 1 of the device flow: request a code, hand it straight back so the
  // renderer can show "go to <url>, enter <code>" immediately. Step 2 (the
  // poll) runs in the background, not awaited here -- a person approving on
  // their phone might take a while, and this IPC call isn't meant to hang
  // open for it.
  ipcMain.handle('youtube:connect', async () => {
    const { deviceCode, userCode, verificationUrl, interval, expiresIn } = await youtube.requestDeviceCode();
    youtubeConnectState = { userCode, verificationUrl, expiresAt: Date.now() + expiresIn * 1000 };
    broadcastStatus();
    youtube
      .pollForToken({ deviceCode, interval, expiresIn })
      .then(() => {
        youtubeConnectState = null;
        logActivity('YouTube', 'Connected.', 'info');
      })
      .catch((err) => {
        youtubeConnectState = null;
        logActivity('YouTube', `Connect failed: ${err.message}`, 'error');
      });
    return fullStatus().youtube;
  });
  ipcMain.handle('youtube:disconnect', () => {
    youtube.disconnect();
    writeYoutubeSecret({ refreshToken: '' });
    youtubeConnectState = null;
    broadcastStatus();
    return fullStatus().youtube;
  });
  // Reuses the exact same dialog as a setText step's "File" value type --
  // this is the uploadToYouTube step's optional file override.
  ipcMain.handle('youtube:pickVideoFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(controlWindow, {
      title: 'Choose a video file',
      properties: ['openFile'],
      filters: [
        { name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'flv', 'avi', 'webm'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return canceled || !filePaths.length ? null : filePaths[0];
  });
  // Fixed Google Cloud Console URLs, not accepting anything from the
  // renderer -- one handler per setup step (API Library, OAuth consent
  // screen, Credentials) rather than one generic "open any URL" handler, so
  // there's nothing here for a compromised renderer to redirect elsewhere.
  ipcMain.handle('youtube:openApiLibrary', () => {
    shell.openExternal('https://console.cloud.google.com/apis/library/youtube.googleapis.com');
  });
  ipcMain.handle('youtube:openConsentScreen', () => {
    shell.openExternal('https://console.cloud.google.com/apis/credentials/consent');
  });
  ipcMain.handle('youtube:openCredentials', () => {
    shell.openExternal('https://console.cloud.google.com/apis/credentials');
  });
  // The device-flow approval URL Google itself returned for the connect
  // currently in progress (youtubeConnectState, set by 'youtube:connect'
  // above) -- read from server-side state, not a URL the renderer passes
  // in, so there's nothing to validate: this only ever opens whatever
  // Google's own device-code response said, for the connect Studio itself
  // just started.
  ipcMain.handle('youtube:openVerificationUrl', () => {
    if (!youtubeConnectState) return { ok: false };
    shell.openExternal(youtubeConnectState.verificationUrl);
    return { ok: true };
  });
  // --- Regions ---
  ipcMain.handle('view:snapshot', async (_event, id) => {
    const win = viewWindows.get(id);
    const wc = pageOf(id);
    if (!isAlive(win) || !win.isVisible() || !wc) throw new Error('Start the window first.');
    const [width, height] = pageSize(win);
    const image = await wc.capturePage();
    return { dataUrl: image.toJPEG(80).length ? `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}` : image.toDataURL(), width, height };
  });
  ipcMain.handle('view:measure', async (_event, id, selector) => {
    const wc = pageOf(id);
    if (!wc) throw new Error('Start the window first.');
    return measureSelector(wc, selector);
  });
  ipcMain.handle('regions:save', async (_event, id, region) => {
    getView(id);
    const input = region && typeof region === 'object' ? { ...region } : {};
    const saved = configStore.saveRegion(id, input);
    scheduleObsSync();
    broadcastStatus();
    return saved;
  });
  ipcMain.handle('regions:setEnabled', async (_event, id, regionId, enabled) => {
    const region = configStore.getRegion(id, regionId);
    if (!region) throw new Error('Unknown region.');
    const saved = configStore.saveRegion(id, { ...region, enabled: Boolean(enabled) });
    if (obs.connected && saved.obsSource && obs.status().inputs.includes(saved.obsSource)) {
      await obs.setSourceVisible(saved.obsSource, Boolean(enabled)).catch((err) => console.warn(`[obs] visibility: ${err.message}`));
    }
    scheduleObsSync();
    broadcastStatus();
    return saved;
  });
  // Deletes a source from OBS. A region forgets the name so the next Add
  // picks a fresh one; a window keeps its name so Add to OBS re-creates it.
  // A Tavern source forgets its name too, and its tick turns off -- unlike
  // a window's name, Tavern's is auto-assigned, and syncTavern recreates
  // any source whose name is still on file, so leaving it in place would
  // just bring the deleted input right back on the next sync.
  ipcMain.handle('obs:removeSource', async (_event, inputName) => {
    if (typeof inputName !== 'string' || !inputName) return;
    // status().inputs only ever lists screen_capture inputs (windows and
    // regions); a Tavern source is a browser_source, so that check always
    // missed it and this deleted nothing in OBS while still forgetting the
    // name -- allInputNames() is kind-agnostic.
    if ((await obs.allInputNames()).has(inputName)) await obs.removeInput(inputName);
    for (const view of configStore.get().views) {
      const regions = view.regions.map((r) => (r.obsSource === inputName ? { ...r, obsSource: '' } : r));
      if (regions.some((r, i) => r !== view.regions[i])) configStore.updateView(view.id, { regions });
    }
    const current = configStore.get();
    const players = { ...current.tavern.players };
    let changed = false;
    for (const [key, entry] of Object.entries(players)) {
      if (entry.source === inputName) {
        players[key] = { ...entry, source: '', player: false };
        changed = true;
      } else if (entry.characterSource === inputName) {
        players[key] = { ...entry, characterSource: '', character: false };
        changed = true;
      }
    }
    if (changed) configStore.save({ ...current, tavern: { ...current.tavern, players } });
    broadcastStatus();
  });
  ipcMain.handle('regions:remove', (_event, id, regionId) => {
    configStore.removeRegion(id, regionId);
    broadcastStatus();
  });
  ipcMain.handle('regions:limits', () => REGION_LIMITS);
  ipcMain.handle('obs:createRegionSource', async (_event, id, regionId) => {
    const view = getView(id);
    const region = configStore.getRegion(id, regionId);
    if (!region) throw new Error('Unknown region.');
    const win = viewWindows.get(id);
    const windowId = systemWindowId(win);
    if (!windowId) throw new Error('Start the window first so OBS can capture it.');
    const taken = new Set(obs.status().inputs);
    // The number that disambiguates a collision goes on the region's own
    // name, not the window's (the window>region pair is what has to be
    // unique, and the region name is the more specific of the two).
    const regionSourceName = (n) => `Region: ${view.label}>${region.name}${n > 1 ? ` ${n}` : ''} (CP Studio)`;
    let name = region.obsSource;
    if (!name) {
      let n = 1;
      name = regionSourceName(n);
      while (taken.has(name)) name = regionSourceName(++n);
    } else if (taken.has(name)) {
      throw new Error(`"${name}" already exists in OBS.`);
    }
    await obs.createInput(name, windowId);
    await obs.ensureCropFilter(name, cropFor(win, region));
    await obs.setInputMuted(name, Boolean(view.muted)).catch(() => {});
    configStore.saveRegion(id, { ...region, obsSource: name });
    broadcastStatus();
    return name;
  });

  ipcMain.on('bar:resize', (event, dw, dh) => {
    const id = viewIdOf(BrowserWindow.fromWebContents(event.sender));
    if (id && Number.isInteger(dw) && Number.isInteger(dh)) resizePage(id, dw, dh);
  });
  ipcMain.on('bar:focusPage', (event) => {
    const id = viewIdOf(BrowserWindow.fromWebContents(event.sender));
    const wc = id ? pageOf(id) : null;
    if (wc) wc.focus();
  });
  ipcMain.on('bar:reload', (event) => {
    const id = viewIdOf(BrowserWindow.fromWebContents(event.sender));
    if (id) reloadView(id);
  });
  ipcMain.on('bar:wakeAudio', (event) => {
    const id = viewIdOf(BrowserWindow.fromWebContents(event.sender));
    if (!id) return;
    if (wakeAudio(id)) wakeWhenReady(id, 5000);
    setTimeout(broadcastStatus, 800);
  });
  ipcMain.on('bar:devTools', (event) => {
    const id = viewIdOf(BrowserWindow.fromWebContents(event.sender));
    const wc = id ? pageOf(id) : null;
    if (wc) wc.toggleDevTools();
  });
  ipcMain.handle('config:reveal', () => shell.showItemInFolder(configStore.filePath));
  ipcMain.handle('status:get', () => fullStatus());
  ipcMain.handle('displays:get', () => screen.getAllDisplays().map(displaySummary));
  ipcMain.handle('app:info', () => ({
    name: APP_NAME,
    limits: LIMITS,
    version: APP_VERSION,
    revision: REVISION,
    build: BUILD_INFO,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    configPath: configStore.filePath,
  }));

  ipcMain.handle('view:open', (_event, id) => {
    createViewWindow(getView(id));
    return viewStatus(getView(id));
  });
  ipcMain.handle('view:close', (_event, id) => closeView(id));
  ipcMain.handle('view:reload', (_event, id) => reloadView(id));
  ipcMain.handle('view:reset', (_event, id) => resetView(id));
  ipcMain.handle('view:devtools', (_event, id) => {
    const wc = pageOf(id);
    if (wc) wc.toggleDevTools();
  });
  ipcMain.handle('view:wakeAudio', (_event, id) => {
    if (!wakeAudio(id)) throw new Error('Start the window first.');
    wakeWhenReady(id, 5000); // and keep at it while Foundry says it is still locked
    setTimeout(broadcastStatus, 800);
  });
  ipcMain.handle('views:arrange', (_event, displayId) => arrangeViews(displayId));
  ipcMain.handle('views:openAll', () => openAllViews());
  ipcMain.handle('views:closeAll', () => closeAllViews());

  ipcMain.handle('session:clear', async () => {
    const { response } = await dialog.showMessageBox(controlWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Sign Out'],
      defaultId: 1,
      cancelId: 0,
      message: 'Sign out of Foundry?',
      detail: 'This clears cookies and site data for both windows. You will need to log in again.',
    });
    if (response !== 1) return false;
    const partitions = new Set([PARTITION, ...configStore.get().views.map(partitionFor)]);
    for (const partition of partitions) {
      const ses = session.fromPartition(partition);
      await ses.clearStorageData();
      await ses.clearCache();
    }
    for (const id of viewWindows.keys()) reloadView(id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Session permissions
// ---------------------------------------------------------------------------

const configuredPartitions = new Set();
function configureSession(partition = PARTITION) {
  if (configuredPartitions.has(partition)) return;
  configuredPartitions.add(partition);
  const ses = session.fromPartition(partition);
  const allowed = new Set(['media', 'notifications', 'fullscreen', 'pointerLock', 'clipboard-read', 'clipboard-sanitized-write']);
  const configuredOrigins = () =>
    new Set(
      configStore.get().views.map((v) => {
        try {
          return new URL(v.url).origin;
        } catch (err) {
          return null;
        }
      }),
    );
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let origin = null;
    try {
      origin = new URL(details.requestingUrl || webContents.getURL()).origin;
    } catch (err) {
      origin = null;
    }
    callback(allowed.has(permission) && configuredOrigins().has(origin));
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => createControlWindow());

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      credits: 'Two fixed-size Chromium windows for capturing FoundryVTT in OBS.',
    });
    configureSession();
    registerIpc();
    buildMenu();
    setupTray();
    setupDock();
    createControlWindow();
    openLaunchViews();
    obs.start().catch(() => {});
    tavern.start().catch(() => {});
    syncAutomationsServer().catch(() => {});

    const onDisplays = () => {
      layoutDock();
      broadcastStatus();
    };
    screen.on('display-added', onDisplays);
    screen.on('display-removed', onDisplays);
    screen.on('display-metrics-changed', onDisplays);
  });

  // The cameraman client Herald talks about is very likely the Stream
  // window itself -- an Electron webContents running inside this app, on
  // this Mac, not a separate browser someone can manually click through a
  // cert warning in (there's no such warning UI for a fetch() call that
  // isn't a top-level navigation; it just fails). Since Studio generated
  // this exact certificate, it can vouch for it here -- checked by the
  // actual DER bytes, not the fingerprint string (whose format isn't
  // documented precisely enough to trust matching on), and only while the
  // Automations server we generated it for is actually the one running.
  // Every other certificate error (Tavern, Foundry itself, anything real)
  // still gets Electron's normal validation; this never widens beyond the
  // one certificate this app made for itself.
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (automations.listening && trustsOwnAutomationsCert(certificate)) {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });
  app.on('activate', () => createControlWindow());
  app.on('before-quit', () => {
    quitting = true;
    obs.stop().catch(() => {});
    tavern.stop().catch(() => {});
    automations.stop().catch(() => {});
  });
  // Standard macOS behaviour: the app stays alive in the Dock with no windows.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
