'use strict';

// Persistent configuration for Coffee Pub Studio.
// Stored as JSON in Electron's per-user data directory, e.g.
// ~/Library/Application Support/Coffee Pub Studio/config.json

const fs = require('fs');
const path = require('path');

// Version 12 reads only the current field names: the old ones (obsSources,
// openOnLaunch, obs.enabled, the pre-0.1.9 Tavern names) are no longer
// migrated.
const CONFIG_VERSION = 12;

// Session groups: windows with the same group name share cookies and storage.
const DEFAULT_GROUP = 'Main';

const LIMITS = {
  minSize: 100,
  maxSize: 7680,
  minViews: 0,
  maxViews: 5,
};

// The OBS source name a window gets unless the user picks another. Every
// source this app creates -- windows, regions, Tavern sources -- follows
// the same "Type: Name (CP Studio)" shape, so OBS's own source pickers
// (which sort by kind, not by who added something) group everything this
// app made under its own type, and the "(CP Studio)" tail still answers
// "what put this here" once you're looking at one.
function defaultSourceName(label) {
  return `Window: ${label} (CP Studio)`;
}

// A fresh window: no URL, a generic label and size. Nothing here assumes
// Foundry, or any particular site -- this app wraps any web page in a
// fixed-size, OBS-capturable window, and is optimized for FoundryVTT
// without being exclusive to it. The user names and points each window at
// whatever they're actually running.
function defaultView(index) {
  const label = `Window ${index + 1}`;
  return {
    id: `window${index + 1}`,
    label,
    url: '',
    width: 1280,
    height: 720,
    x: null,
    y: null,
    muted: true,
    enabled: true,
    dockOnLaunch: false,
    wakeAudio: true,
    session: DEFAULT_GROUP,
    windowSource: { enabled: true, name: defaultSourceName(label) },
    regions: [],
  };
}

// A free-form session group name; empty means the default group.
function sanitizeSession(value) {
  if (value === undefined || value === null) return DEFAULT_GROUP;
  const text = String(value).trim().slice(0, 40);
  return text || DEFAULT_GROUP;
}

const REGION_LIMITS = { maxRegions: 12, maxSelector: 300 };

// A region is a named rectangle inside a window, in window points. In
// selector mode the rectangle is re-measured from the page element.
function sanitizeRegion(input, index, taken) {
  const src = input && typeof input === 'object' ? input : {};
  let id = sanitizeId(src.id, `region${index + 1}`);
  let n = 2;
  while (taken.has(id)) id = `region${index + 1}-${n++}`;
  taken.add(id);
  const positive = (v, fallback) => Math.max(0, toInt(v, fallback));
  return {
    id,
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 40) : `Region ${index + 1}`,
    mode: src.mode === 'selector' ? 'selector' : 'rect',
    selector: typeof src.selector === 'string' ? src.selector.trim().slice(0, REGION_LIMITS.maxSelector) : '',
    x: positive(src.x, 0),
    y: positive(src.y, 0),
    width: Math.max(1, toInt(src.width, 100)),
    height: Math.max(1, toInt(src.height, 100)),
    obsSource: typeof src.obsSource === 'string' ? src.obsSource.trim().slice(0, 200) : '',
    enabled: src.enabled === undefined ? true : Boolean(src.enabled),
  };
}

function sanitizeRegions(value) {
  if (!Array.isArray(value)) return [];
  const taken = new Set();
  return value.slice(0, REGION_LIMITS.maxRegions).map((r, i) => sanitizeRegion(r, i, taken));
}

function defaultDock() {
  // overlap: points of a docked window left on screen (0 = fully off screen).
  return { enabled: true, side: 'right', overlap: 6 };
}

function sanitizeDock(input) {
  const d = defaultDock();
  const src = input && typeof input === 'object' ? input : {};
  return {
    enabled: src.enabled === undefined ? d.enabled : Boolean(src.enabled),
    side: src.side === 'left' ? 'left' : 'right',
    overlap: clamp(toInt(src.overlap, d.overlap), 0, 36),
  };
}

function defaultObs() {
  return { autoConnect: false, host: '127.0.0.1', port: 4455 };
}

// Automations: a small HTTP server Foundry modules (starting with Herald)
// call to report events (e.g. "combat has started"), which can then run a
// rule set here -- a named, numbered sequence of OBS/Studio actions and
// delays. Foundry typically runs on a different machine than Studio, so
// this listens on the LAN, not just localhost -- the token is the only
// thing standing between that port and anyone else on the network, so the
// server refuses to start without one.
//
// Two kinds of action:
// - OBS actions (AUTOMATIONS_ACTIONS) are always available -- Studio
//   already owns the OBS connection for everything else, so there's no
//   reason to gate them.
// - Studio actions (STUDIO_ACTIONS) reach into Studio itself (wake a
//   window's audio, start/stop/dock every window, re-sync OBS). These are
//   opt-in per action (`automations.studioActions`), off by default, since
//   they're a bigger blast radius than "switch a scene" and shouldn't be
//   reachable just because Automations happens to be turned on.
//
// Both are grouped (`group`) so a caller like Herald can build a menu --
// "Controls > Start Recording", "Scenes > Combat" -- instead of one flat
// list; GET /api/automations/capabilities returns both together.
const AUTOMATIONS_LIMITS = {
  maxRuleSets: 40,
  maxStepsPerRuleSet: 20,
  maxNameLen: 60,
  maxGroupLen: 40,
  maxEventLen: 60,
  maxParamLen: 200,
  maxDelaySeconds: 3600,
};
const AUTOMATIONS_ACTIONS = [
  'sceneSwitch', 'sourceShow', 'sourceHide', 'sourceToggle', 'setText',
  'startRecording', 'pauseRecording', 'resumeRecording', 'stopRecording',
  'startStreaming', 'stopStreaming',
];
// What each action means, what its `param` is for (and what kind of thing
// the param is -- 'scene'/'source' so a picker can be shown instead of a
// free-text field), and which menu group it belongs in. The authoritative
// copy: GET /api/automations/capabilities (main.js) reads this directly so
// a caller can discover Studio's action vocabulary instead of hardcoding
// it; src/control/control.js keeps its own renderer-side copy for the
// Automations UI (kept in sync by hand, same reasoning as TAVERN_KINDS
// there), since it can't require this file directly across the preload
// boundary.
const AUTOMATIONS_ACTION_SCHEMA = [
  { action: 'sceneSwitch', param: 'scene name', paramType: 'scene', group: 'Scenes' },
  { action: 'sourceShow', param: 'source name', paramType: 'source', group: 'Sources' },
  { action: 'sourceHide', param: 'source name', paramType: 'source', group: 'Sources' },
  { action: 'sourceToggle', param: 'source name', paramType: 'source', group: 'Sources' },
  { action: 'setText', param: 'source name', paramType: 'source', group: 'Sources' },
  { action: 'startRecording', param: null, paramType: 'none', group: 'Controls' },
  { action: 'pauseRecording', param: null, paramType: 'none', group: 'Controls' },
  { action: 'resumeRecording', param: null, paramType: 'none', group: 'Controls' },
  { action: 'stopRecording', param: null, paramType: 'none', group: 'Controls' },
  { action: 'startStreaming', param: null, paramType: 'none', group: 'Controls' },
  { action: 'stopStreaming', param: null, paramType: 'none', group: 'Controls' },
];
// Studio actions: same shape, plus a `label` (there's no single-word verb
// for most of these the way there is for the OBS actions). Every one is off
// by default and only reaches capabilities / the rule-set step list once
// ticked on in automations.studioActions -- see the note above.
const STUDIO_ACTIONS = [
  'wakeAudio', 'startAll', 'stopAll', 'dockAll', 'undockAll', 'syncObs',
  'incrementEpisode', 'applyEpisodeText', 'applySessionFilename',
];
const STUDIO_ACTION_SCHEMA = [
  { action: 'wakeAudio', label: 'Wake audio (every open window)', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'startAll', label: 'Start all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'stopAll', label: 'Stop all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'dockAll', label: 'Dock all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'undockAll', label: 'Undock all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'syncObs', label: 'Sync OBS', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'incrementEpisode', label: 'Increment episode number', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'applyEpisodeText', label: 'Write season/episode to a text source', param: 'source name', paramType: 'source', group: 'Studio Control' },
  { action: 'applySessionFilename', label: 'Apply the session filename format to OBS', param: null, paramType: 'none', group: 'Studio Control' },
];

function defaultAutomations() {
  return { enabled: false, port: 9500, token: '', studioActions: [], ruleSets: [] };
}

// One step in a rule set's numbered sequence: either an action (an OBS
// action, or a Studio action currently enabled in studioActions) or a
// delay. `and: true` on an action step means "run together with the step
// before it" instead of waiting for it -- consecutive `and` action steps
// form one numbered stage that fires at once; a plain (non-`and`) step, or
// a delay, starts a new stage. Delay steps can't be `and` -- there's
// nothing to run alongside a wait, and the first step in a rule set can't
// be `and` either, since there is no step before it to join.
function sanitizeAutomationStep(input, index, allowedActions, taken) {
  const src = input && typeof input === 'object' ? input : {};
  let id = sanitizeId(src.id, `step${index + 1}`);
  let n = 2;
  while (taken.has(id)) id = `step${index + 1}-${n++}`;
  taken.add(id);
  if (src.type === 'delay') {
    return {
      id,
      type: 'delay',
      seconds: clamp(toInt(src.seconds, 1), 1, AUTOMATIONS_LIMITS.maxDelaySeconds),
      and: false,
    };
  }
  const action = allowedActions.includes(src.action) ? src.action : allowedActions[0];
  return {
    id,
    type: 'action',
    action,
    param: typeof src.param === 'string' ? src.param.trim().slice(0, AUTOMATIONS_LIMITS.maxParamLen) : '',
    and: Boolean(src.and),
    // Only meaningful for setText -- "where it goes" is `param` above;
    // these four are "what it is", one of three kinds a user picks
    // explicitly rather than there being one ambiguous free-text field
    // that's sometimes a literal value and sometimes a lookup key:
    //   - "literal": `value`, typed once, always the same when this step
    //     runs -- a fixed text preset, no external caller involved at all.
    //   - "file": `filePath`, a local text file Studio reads fresh every
    //     time this step runs.
    //   - "dataField": `dataField`, a key into the triggering event's own
    //     `data` -- picked from whatever fields a connected module has
    //     actually registered (POST /api/automations/fields), not typed
    //     blind against an undocumented contract.
    valueType: ['literal', 'file', 'dataField'].includes(src.valueType) ? src.valueType : 'literal',
    value: typeof src.value === 'string' ? src.value.slice(0, 500) : '',
    filePath: typeof src.filePath === 'string' ? src.filePath.trim().slice(0, 500) : '',
    dataField: typeof src.dataField === 'string' ? src.dataField.trim().slice(0, 60) : '',
  };
}

function sanitizeRuleSet(input, index, taken, allowedActions) {
  const src = input && typeof input === 'object' ? input : {};
  let id = sanitizeId(src.id, `ruleset${index + 1}`);
  let n = 2;
  while (taken.has(id)) id = `ruleset${index + 1}-${n++}`;
  taken.add(id);
  const stepTaken = new Set();
  const steps = (Array.isArray(src.steps) ? src.steps : [])
    .slice(0, AUTOMATIONS_LIMITS.maxStepsPerRuleSet)
    .map((s, i) => sanitizeAutomationStep(s, i, allowedActions, stepTaken));
  if (steps[0]) steps[0].and = false;
  return {
    id,
    name: typeof src.name === 'string' ? src.name.trim().slice(0, AUTOMATIONS_LIMITS.maxNameLen) : '',
    group: typeof src.group === 'string' ? src.group.trim().slice(0, AUTOMATIONS_LIMITS.maxGroupLen) : '',
    enabled: src.enabled === undefined ? true : Boolean(src.enabled),
    event: typeof src.event === 'string' ? src.event.trim().slice(0, AUTOMATIONS_LIMITS.maxEventLen) : '',
    steps,
  };
}

function sanitizeAutomations(input) {
  const d = defaultAutomations();
  const src = input && typeof input === 'object' ? input : {};
  const studioActions = (Array.isArray(src.studioActions) ? src.studioActions : []).filter((a) => STUDIO_ACTIONS.includes(a));
  const allowedActions = [...AUTOMATIONS_ACTIONS, ...studioActions];
  const taken = new Set();
  // A config saved before rule sets existed only has the old flat `rules`
  // shape ({id, event, action, param} each, one action per event). Migrate
  // each into an equivalent one-step rule set rather than silently
  // discarding real configured automations the first time this runs
  // against an old config -- `ruleSets` wins if both are somehow present.
  const rawRuleSets = Array.isArray(src.ruleSets)
    ? src.ruleSets
    : Array.isArray(src.rules)
      ? src.rules.map((r) => ({
          id: r && r.id,
          name: (r && r.event) || '',
          group: '',
          enabled: true,
          event: r && r.event,
          steps: [{ type: 'action', action: r && r.action, param: r && r.param, and: false }],
        }))
      : [];
  // No filter on event/steps here -- a rule set the user is still filling
  // in (named but no event yet, or no steps yet) stays exactly like an
  // incomplete region does: harmless (it never matches anything and never
  // runs anything) rather than silently deleted the moment any one field
  // is edited before every field is.
  const ruleSets = rawRuleSets
    .slice(0, AUTOMATIONS_LIMITS.maxRuleSets)
    .map((r, i) => sanitizeRuleSet(r, i, taken, allowedActions));
  return {
    enabled: src.enabled === undefined ? d.enabled : Boolean(src.enabled),
    port: clamp(toInt(src.port, d.port), 1024, 65535),
    token: typeof src.token === 'string' ? src.token.trim().slice(0, 200) : d.token,
    studioActions,
    ruleSets,
  };
}

// Coffee Pub Tavern: the voice and video server for the people at the table.
// Each published user gets a Participant source (video, or their player
// image when the camera is off) and optionally a Character source (their
// character image with talking and muted images on top).
function defaultTavern() {
  return {
    enabled: false, url: '', login: '', autoConnect: true,
    playerWidth: 640, playerHeight: 360, lockRatio: true,
    characterWidth: 256, characterHeight: 256, characterWithPlayer: false,
    room: 'lobby', // the Tavern room whose members the Tavern tab shows and OBS sources gate on
    followAdmin: true, // "Enable Asides": mute anyone live in a different room than `room` above
    players: {},
  };
}

function sanitizeTavern(input) {
  const d = defaultTavern();
  const src = input && typeof input === 'object' ? input : {};
  const players = {};
  if (src.players && typeof src.players === 'object') {
    for (const [key, value] of Object.entries(src.players)) {
      if (!/^[a-z0-9]{4,16}$/.test(key) || !value || typeof value !== 'object') continue;
      const entry = {
        source: typeof value.source === 'string' ? value.source.trim().slice(0, 200) : '',
        characterSource: typeof value.characterSource === 'string' ? value.characterSource.trim().slice(0, 200) : '',
        // The Participant and Character ticks
        player: value.player === undefined ? true : Boolean(value.player),
        character: value.character === undefined ? Boolean(value.characterSource) : Boolean(value.character),
      };
      const touched = value.player !== undefined || value.character !== undefined;
      if (entry.source || entry.characterSource || touched) players[key] = entry;
    }
  }
  return {
    enabled: src.enabled === undefined ? d.enabled : Boolean(src.enabled),
    url: sanitizeUrl(src.url).replace(/\/+$/, ''),
    login: typeof src.login === 'string' ? src.login.trim().slice(0, 40) : d.login,
    autoConnect: src.autoConnect === undefined ? d.autoConnect : Boolean(src.autoConnect),
    playerWidth: clamp(toInt(src.playerWidth, d.playerWidth), 64, 3840),
    playerHeight: clamp(toInt(src.playerHeight, d.playerHeight), 64, 2160),
    lockRatio: src.lockRatio === undefined ? d.lockRatio : Boolean(src.lockRatio),
    characterWidth: clamp(toInt(src.characterWidth, d.characterWidth), 32, 3840),
    characterHeight: clamp(toInt(src.characterHeight, d.characterHeight), 32, 2160),
    characterWithPlayer: src.characterWithPlayer === undefined ? d.characterWithPlayer : Boolean(src.characterWithPlayer),
    room: typeof src.room === 'string' && /^[a-z0-9_-]{1,40}$/i.test(src.room) ? src.room : 'lobby',
    followAdmin: src.followAdmin === undefined ? d.followAdmin : Boolean(src.followAdmin),
    players,
  };
}

// Season/episode numbering Studio itself tracks, for the Studio Control
// actions that write it into OBS (a text source, the recording filename)
// instead of it being hand-typed into OBS before every session. `season`
// and `episode` are always zero-padded to 2 digits wherever a template
// substitutes them in ({season}/{episode}); {title}/{campaign}, the other
// two placeholders the same templates accept, come from the triggering
// event's own data, not from here -- see incrementEpisode/applyEpisodeText/
// applySessionFilename in src/main.js.
function defaultSession() {
  return {
    season: 1,
    episode: 1,
    episodeSourceName: '',
    episodeFormat: 'SEASON {season}              EPISODE {episode}',
    filenameFormat: '',
  };
}

function sanitizeSession(input) {
  const d = defaultSession();
  const src = input && typeof input === 'object' ? input : {};
  return {
    season: clamp(toInt(src.season, d.season), 0, 999),
    episode: clamp(toInt(src.episode, d.episode), 0, 9999),
    episodeSourceName: typeof src.episodeSourceName === 'string' ? src.episodeSourceName.trim().slice(0, 200) : d.episodeSourceName,
    episodeFormat: typeof src.episodeFormat === 'string' ? src.episodeFormat.slice(0, 300) : d.episodeFormat,
    filenameFormat: typeof src.filenameFormat === 'string' ? src.filenameFormat.slice(0, 300) : d.filenameFormat,
  };
}

// Where the control panel was last left; null lets Electron place it.
function sanitizePanel(input) {
  if (!input || typeof input !== 'object') return null;
  const x = toInt(input.x, null);
  const y = toInt(input.y, null);
  const width = toInt(input.width, null);
  const height = toInt(input.height, null);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width: clamp(width, 720, 7680), height: clamp(height, 560, 4320) };
}

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    panel: null,
    menuBarIcon: true,
    hideDockIcon: false,
    wakeAudioDelay: 30, // seconds after a page loads before its audio is woken
    // On a Retina display OBS captures twice the pixels; false scales the
    // app's sources by half in OBS so they land at the configured size.
    retinaDouble: false,
    arrangeDisplayId: null,
    dock: defaultDock(),
    obs: defaultObs(),
    tavern: defaultTavern(),
    automations: defaultAutomations(),
    session: defaultSession(),
    // No windows on a fresh install -- the user adds and points each one at
    // whatever they're actually running via the "+" tab.
    views: [],
  };
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Returns a normalised http(s) URL, or '' when the value is empty or invalid.
function sanitizeUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch (err) {
    return '';
  }
}

function sanitizeId(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,40}$/i.test(value) ? value : fallback;
}

function sanitizeView(input, index) {
  const fallback = defaultView(index);
  const src = input && typeof input === 'object' ? input : {};
  const x = src.x === null || src.x === undefined || src.x === '' ? null : toInt(src.x, null);
  const y = src.y === null || src.y === undefined || src.y === '' ? null : toInt(src.y, null);
  const label = typeof src.label === 'string' && src.label.trim() ? src.label.trim().slice(0, 40) : fallback.label;
  return {
    id: sanitizeId(src.id, fallback.id),
    label,
    url: src.url === undefined ? fallback.url : sanitizeUrl(src.url),
    width: clamp(toInt(src.width, fallback.width), LIMITS.minSize, LIMITS.maxSize),
    height: clamp(toInt(src.height, fallback.height), LIMITS.minSize, LIMITS.maxSize),
    x,
    y,
    muted: src.muted === undefined ? fallback.muted : Boolean(src.muted),
    enabled: src.enabled === undefined ? fallback.enabled : Boolean(src.enabled),
    dockOnLaunch: src.dockOnLaunch === undefined ? fallback.dockOnLaunch : Boolean(src.dockOnLaunch),
    wakeAudio: src.wakeAudio === undefined ? fallback.wakeAudio : Boolean(src.wakeAudio),
    session: sanitizeSession(src.session),
    windowSource: sanitizeWindowSource(src.windowSource, label, fallback),
    regions: sanitizeRegions(src.regions),
  };
}

// The whole window as one OBS source: an on/off switch and the source name.
function sanitizeWindowSource(input, label, fallback) {
  const ws = input && typeof input === 'object' ? input : null;
  const enabled = ws && ws.enabled !== undefined ? Boolean(ws.enabled) : fallback.windowSource.enabled;
  const raw = ws && typeof ws.name === 'string' ? ws.name : '';
  const name = raw.trim().slice(0, 200) || defaultSourceName(label);
  return { enabled, name };
}

function sanitizeObs(input) {
  const d = defaultObs();
  const src = input && typeof input === 'object' ? input : {};
  const host = typeof src.host === 'string' && src.host.trim() ? src.host.trim().slice(0, 200) : d.host;
  return {
    autoConnect: Boolean(src.autoConnect),
    host,
    port: clamp(toInt(src.port, d.port), 1, 65535),
  };
}

// Normalise any object into a valid config with 1 to 5 views and unique ids.
function sanitizeConfig(input) {
  const defaults = defaultConfig();
  const src = input && typeof input === 'object' ? input : {};
  let inputViews = Array.isArray(src.views) ? src.views : defaults.views;
  if (inputViews.length < LIMITS.minViews) inputViews = defaults.views.slice(0, LIMITS.minViews);
  inputViews = inputViews.slice(0, LIMITS.maxViews);

  const seen = new Set();
  const views = inputViews.map((v, index) => {
    const view = sanitizeView(v, index);
    let id = view.id;
    let n = 2;
    while (seen.has(id)) id = `${view.id}-${n++}`;
    seen.add(id);
    return { ...view, id };
  });

  return {
    version: CONFIG_VERSION,
    menuBarIcon: src.menuBarIcon === undefined ? defaults.menuBarIcon : Boolean(src.menuBarIcon),
    hideDockIcon: src.hideDockIcon === undefined ? defaults.hideDockIcon : Boolean(src.hideDockIcon),
    wakeAudioDelay: clamp(toInt(src.wakeAudioDelay, defaults.wakeAudioDelay), 10, 300),
    retinaDouble: src.retinaDouble === undefined ? defaults.retinaDouble : Boolean(src.retinaDouble),
    arrangeDisplayId: Number.isFinite(Number(src.arrangeDisplayId)) && src.arrangeDisplayId !== null ? Number(src.arrangeDisplayId) : null,
    dock: sanitizeDock(src.dock),
    obs: sanitizeObs(src.obs),
    tavern: sanitizeTavern(src.tavern),
    automations: sanitizeAutomations(src.automations),
    session: sanitizeSession(src.session),
    panel: sanitizePanel(src.panel),
    views,
  };
}

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.loadedVersion = null;
    this.data = this.load();
    // Rewrite files saved by an older version so they carry the new shape.
    if (this.loadedVersion !== null && this.loadedVersion !== CONFIG_VERSION) {
      this.save(this.data);
    }
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.loadedVersion = parsed && typeof parsed === 'object' ? parsed.version : undefined;
      return sanitizeConfig(parsed);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[config] Could not read ${this.filePath}, using defaults: ${err.message}`);
      }
      return defaultConfig();
    }
  }

  save(next) {
    this.data = sanitizeConfig(next);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
    return this.data;
  }

  get() {
    return JSON.parse(JSON.stringify(this.data));
  }

  getView(id) {
    return this.data.views.find((v) => v.id === id) || null;
  }

  updateView(id, patch) {
    const views = this.data.views.map((v) => (v.id === id ? { ...v, ...patch } : v));
    return this.save({ ...this.data, views });
  }

  getRegion(viewId, regionId) {
    const view = this.getView(viewId);
    return view ? view.regions.find((r) => r.id === regionId) || null : null;
  }

  // Add (no id / unknown id) or replace a region on a view. Returns the saved region.
  saveRegion(viewId, region) {
    const view = this.getView(viewId);
    if (!view) throw new Error(`Unknown view: ${viewId}`);
    const regions = view.regions.slice();
    const index = regions.findIndex((r) => r.id === region.id);
    if (index >= 0) {
      regions[index] = { ...regions[index], ...region, id: regions[index].id };
    } else {
      if (regions.length >= REGION_LIMITS.maxRegions) throw new Error(`At most ${REGION_LIMITS.maxRegions} regions per window.`);
      regions.push({ ...region, id: undefined });
    }
    const saved = this.updateView(viewId, { regions });
    const savedView = saved.views.find((v) => v.id === viewId);
    return index >= 0 ? savedView.regions[index] : savedView.regions[savedView.regions.length - 1];
  }

  removeRegion(viewId, regionId) {
    const view = this.getView(viewId);
    if (!view) return;
    this.updateView(viewId, { regions: view.regions.filter((r) => r.id !== regionId) });
  }

  // Append a new view with defaults. Returns it, or null when at the limit.
  addView() {
    const views = this.data.views.slice();
    if (views.length >= LIMITS.maxViews) return null;
    const taken = new Set(views.map((v) => v.id));
    const view = defaultView(views.length);
    let id = view.id;
    let n = 2;
    while (taken.has(id)) id = `${view.id}-${n++}`;
    views.push({ ...view, id });
    const saved = this.save({ ...this.data, views });
    return saved.views[saved.views.length - 1];
  }

  // Remove a view by id. The last remaining view cannot be removed.
  removeView(id) {
    if (this.data.views.length <= LIMITS.minViews) return false;
    const views = this.data.views.filter((v) => v.id !== id);
    if (views.length === this.data.views.length) return false;
    this.save({ ...this.data, views });
    return true;
  }
}

module.exports = {
  ConfigStore,
  defaultConfig,
  sanitizeConfig,
  defaultSourceName,
  LIMITS,
  REGION_LIMITS,
  AUTOMATIONS_LIMITS,
  AUTOMATIONS_ACTIONS,
  AUTOMATIONS_ACTION_SCHEMA,
  STUDIO_ACTIONS,
  STUDIO_ACTION_SCHEMA,
  CONFIG_VERSION,
  DEFAULT_GROUP,
};
