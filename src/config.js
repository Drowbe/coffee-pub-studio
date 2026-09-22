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

// A window belonging to some other application (a game, Discord, a
// browser someone else runs), captured into OBS by Studio but not owned by
// it -- see sanitizeAppWindows.
function defaultAppSourceName(label) {
  return `App: ${label} (CP Studio)`;
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

// A free-form session GROUP name (windows sharing cookies/storage); empty
// means the default group. Named distinctly from the season/episode
// sanitizeSession below -- a second `function sanitizeSession` declared
// later in this same module would silently win at every call site,
// including this one's, above it in the file (a real bug caught live: it
// had been overwriting every view's group name with a season/episode
// object on each save).
function sanitizeSessionGroup(value) {
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

// YouTube: uploads a finished recording via the Data API v3's resumable
// upload endpoint, triggered by the `uploadToYouTube` Studio action (see
// STUDIO_ACTION_SCHEMA below) -- never automatic on its own, same reasoning
// as every other Studio action here. Auth is OAuth 2.0's device flow (no
// loopback redirect server, no port to configure -- see src/youtube.js);
// `clientId` is not secret and lives here in plain config, same as
// `obs.host`. `clientSecret` and the refresh token are not: encrypted at
// rest via safeStorage, same pattern as the OBS/Tavern passwords (see
// YOUTUBE_SECRET_PATH, src/main.js), never sent to the renderer.
// `privacyStatus` defaults to "private" deliberately -- publishing a
// recording is a decision for a human to make on YouTube itself, not
// something this app should default to doing for you.
function defaultYoutube() {
  return {
    enabled: false,
    clientId: '',
    privacyStatus: 'private',
    categoryId: '20', // Gaming
  };
}

function sanitizeYoutube(input) {
  const d = defaultYoutube();
  const src = input && typeof input === 'object' ? input : {};
  return {
    enabled: src.enabled === undefined ? d.enabled : Boolean(src.enabled),
    clientId: typeof src.clientId === 'string' ? src.clientId.trim().slice(0, 200) : d.clientId,
    privacyStatus: ['private', 'unlisted', 'public'].includes(src.privacyStatus) ? src.privacyStatus : d.privacyStatus,
    categoryId: typeof src.categoryId === 'string' && /^\d{1,3}$/.test(src.categoryId) ? src.categoryId : d.categoryId,
  };
}

// Automations: a small HTTP server Foundry modules (starting with Herald)
// call to report events (e.g. "combat has started"), which can then run a
// rule set here -- a named, numbered sequence of OBS/Studio actions and
// delays. Foundry typically runs on a different machine than Studio, so
// this listens on the LAN, not just localhost -- the token is the only
// thing standing between that port and anyone else on the network, so the
// server refuses to start without one.
//
// Two kinds of action, both always available, same as each other -- OBS
// actions (AUTOMATIONS_ACTIONS) and Studio actions (STUDIO_ACTIONS, which
// reach into Studio itself: wake a window's audio, start/stop/dock every
// window, re-sync OBS, apply the session filename) used to differ here, an
// opt-in per-Studio-action toggle nobody could find a reason to justify:
// it gated a rule set's own steps -- your own automations needing your own
// permission to use your own actions -- and, separately, external callers
// were already behind the token below, the same as every OBS action always
// was. Removed entirely; the token is the one gate, for both kinds alike.
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
// for most of these the way there is for the OBS actions). Always available,
// same as AUTOMATIONS_ACTIONS -- see the note above.
const STUDIO_ACTIONS = [
  'wakeAudio', 'startAll', 'stopAll', 'dockAll', 'undockAll', 'syncObs',
  'applySessionFilename', 'runRuleSet', 'incrementMetadataField', 'decrementMetadataField',
  'setMetadataField', 'uploadToYouTube',
];
const STUDIO_ACTION_SCHEMA = [
  { action: 'wakeAudio', label: 'Wake audio (every open window)', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'startAll', label: 'Start all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'stopAll', label: 'Stop all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'dockAll', label: 'Dock all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'undockAll', label: 'Undock all windows', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'syncObs', label: 'Sync OBS', param: null, paramType: 'none', group: 'Studio Control' },
  { action: 'applySessionFilename', label: 'Apply the session filename format to OBS', param: null, paramType: 'none', group: 'Studio Control' },
  // param is the target rule set's id, not its name (names aren't required
  // unique; ids are) -- runAutomationAction (main.js) resolves it and
  // refuses a cycle (this rule set already running further up the same
  // call chain) rather than hanging or blowing the stack.
  { action: 'runRuleSet', label: 'Run rule set', param: 'rule set id', paramType: 'ruleSet', group: 'Studio Control' },
  // param is a Metadata field's key (a Number field, or a Text+Number/
  // Number+Text field's number segment) -- the intent-driven replacement
  // for a trailing "+1"/"-1" on a Data Field key, which used to hide this
  // same mutation inside a read (see resolveDataField, src/main.js).
  { action: 'incrementMetadataField', label: 'Increment a Metadata field', param: 'field key', paramType: 'metadataField', group: 'Studio Control' },
  { action: 'decrementMetadataField', label: 'Decrement a Metadata field', param: 'field key', paramType: 'metadataField', group: 'Studio Control' },
  // param is a Text-type Metadata field's key; the value to store comes
  // from `data.value` on a direct POST /api/automations/action call (see
  // resolveMetadataFieldValue, src/main.js), or from the step's own
  // fixed/file/Data-Field choice when run from a rule set, same three
  // sources setText's own step editor already offers.
  { action: 'setMetadataField', label: 'Set a Metadata field', param: 'field key', paramType: 'metadataField', group: 'Studio Control' },
  // No single `param` -- five named slots instead (titleField/
  // descriptionField/categoryField/madeForKidsField/visibilityField, each a
  // Metadata field key; madeForKidsField must point at a "checkbox" field
  // specifically -- see the comment on runYouTubeUpload, src/main.js, for
  // why that one alone is strict), plus the same `filePath` a setText
  // step's "File" valueType already uses (empty = the most recent OBS
  // recording). See runAutomationAction's 'uploadToYouTube' case, src/main.js.
  { action: 'uploadToYouTube', label: 'Upload the recording to YouTube', param: null, paramType: 'youtubeUpload', group: 'Studio Control' },
];

function defaultAutomations() {
  return { enabled: false, port: 9500, token: '', ruleSets: [] };
}

// One step in a rule set's numbered sequence: either an action (an OBS
// action or a Studio action, both always allowed) or a
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
  // A disabled step is skipped entirely at run time (stagesFor, src/main.js)
  // -- as if it weren't in the sequence at all, not "run it but do nothing"
  // -- so someone can turn a step off for a session without losing its
  // configuration the way deleting and later recreating it would.
  const enabled = src.enabled === undefined ? true : Boolean(src.enabled);
  if (src.type === 'delay') {
    return {
      id,
      type: 'delay',
      seconds: clamp(toInt(src.seconds, 1), 1, AUTOMATIONS_LIMITS.maxDelaySeconds),
      and: false,
      enabled,
    };
  }
  const action = allowedActions.includes(src.action) ? src.action : allowedActions[0];
  return {
    id,
    type: 'action',
    action,
    param: typeof src.param === 'string' ? src.param.trim().slice(0, AUTOMATIONS_LIMITS.maxParamLen) : '',
    and: Boolean(src.and),
    enabled,
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
    // filePath doubles as uploadToYouTube's optional file override (empty
    // there means "the most recent OBS recording") -- same field, same
    // meaning ("a path on disk"), no reason for a second one.
    filePath: typeof src.filePath === 'string' ? src.filePath.trim().slice(0, 500) : '',
    dataField: typeof src.dataField === 'string' ? src.dataField.trim().slice(0, 60) : '',
    // uploadToYouTube only -- each a Metadata field key. See its schema
    // entry above and runAutomationAction's case, src/main.js.
    titleField: typeof src.titleField === 'string' ? src.titleField.trim().slice(0, 60) : '',
    descriptionField: typeof src.descriptionField === 'string' ? src.descriptionField.trim().slice(0, 60) : '',
    categoryField: typeof src.categoryField === 'string' ? src.categoryField.trim().slice(0, 60) : '',
    madeForKidsField: typeof src.madeForKidsField === 'string' ? src.madeForKidsField.trim().slice(0, 60) : '',
    visibilityField: typeof src.visibilityField === 'string' ? src.visibilityField.trim().slice(0, 60) : '',
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
  const allowedActions = [...AUTOMATIONS_ACTIONS, ...STUDIO_ACTIONS];
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

// A template Studio writes into OBS's own recording Filename Formatting
// setting instead of it being hand-typed before every session -- see
// applySessionFilename in src/main.js. Season/episode numbering used to
// live here too (a dedicated Studio-tracked pair with their own card),
// retired once Metadata fields could do the same job without a second,
// parallel system -- confirmed unused in practice ("too confusing") before
// removal.
function defaultSession() {
  return {
    filenameFormat: '',
  };
}

function sanitizeSession(input) {
  const d = defaultSession();
  const src = input && typeof input === 'object' ? input : {};
  return {
    filenameFormat: typeof src.filenameFormat === 'string' ? src.filenameFormat.slice(0, 300) : d.filenameFormat,
  };
}

const METADATA_FIELD_LIMITS = { maxFields: 50, maxLabelLen: 60, maxKeyLen: 60, maxValueLen: 500, maxSeparatorLen: 20 };
// "Prompt" is Text-shaped in storage (see sanitizeMetadataField's fallthrough
// below) but has no other way to get a value: it is never editable on the
// Session tab and setMetadataField refuses it (Text only) -- the only write
// path is answering the prompt as part of running whatever rule set actually
// needs it. See collectRequiredPrompts/checkAndApplyPrompts (src/main.js).
const METADATA_FIELD_TYPES = ['text', 'number', 'textNumber', 'numberText', 'checkbox', 'prompt'];
const METADATA_PADDING_OPTIONS = [0, 2, 3, 4];

// Data Field keys Studio itself resolves specially (src/main.js's
// resolveDataField) -- today's date/time. A user-created metadata field's
// generated key can never collide with one of these (see
// uniqueMetadataKey), and a connected module registering one of these
// exact keys has its field shadowed by Studio's own, not rejected -- see
// api-automations.md's "Reserved keys" note.
const RESERVED_FIELD_KEYS = ['sessionTime', 'sessionDate', 'sessionDay', 'sessionMonth', 'sessionYear'];

function sanitizeMetadataField(input) {
  const src = input && typeof input === 'object' ? input : {};
  const type = METADATA_FIELD_TYPES.includes(src.type) ? src.type : 'text';
  const label = typeof src.label === 'string' ? src.label.trim().slice(0, METADATA_FIELD_LIMITS.maxLabelLen) : '';
  const key = typeof src.key === 'string' ? src.key.trim().slice(0, METADATA_FIELD_LIMITS.maxKeyLen) : '';
  const id = sanitizeId(src.id, `field${Date.now().toString(36)}`);

  // "Text + Number"/"Number + Text": a fixed text segment glued to a
  // number segment (which alone is Increment/Decrement-capable, same as a
  // plain Number field's value) via a typed separator and an optional
  // zero-pad width -- covers "Chapter 5"/"5 Days Left" without needing a
  // real {..} template engine. Order, separator, and padding are all fixed
  // at creation, same reasoning as the key: delete and recreate rather than
  // edit in place.
  if (type === 'textNumber' || type === 'numberText') {
    return {
      id,
      label,
      key,
      type,
      text: typeof src.text === 'string' ? src.text.slice(0, METADATA_FIELD_LIMITS.maxValueLen) : '',
      separator: typeof src.separator === 'string' ? src.separator.slice(0, METADATA_FIELD_LIMITS.maxSeparatorLen) : '',
      number: Number.isFinite(Number(src.number)) ? Number(src.number) : 0,
      padding: METADATA_PADDING_OPTIONS.includes(Number(src.padding)) ? Number(src.padding) : 0,
    };
  }

  // "Checkbox": a plain boolean -- added for the YouTube upload action's
  // "made for kids" flag, which needs a real true/false a rule-set step can
  // point at, not a string a human has to
  // type consistently ("true"/"yes"/"1"...) for something this consequential.
  if (type === 'checkbox') return { id, label, key, type, value: Boolean(src.value) };

  // "Text": stored as a plain string, but resolveDataField (src/main.js)
  // expands any {token} it contains before returning it -- the same syntax
  // and resolution the Recording Filename format already uses, and a no-op
  // for a value with no {..} in it. (This used to be a separate "Template"
  // type; merged into Text since it never had a use no Text field could
  // also have -- see the "Text became template-aware" note in
  // architecture-automations.md.)
  const value =
    type === 'number'
      ? Number.isFinite(Number(src.value))
        ? Number(src.value)
        : 0
      : typeof src.value === 'string'
        ? src.value.slice(0, METADATA_FIELD_LIMITS.maxValueLen)
        : '';
  return { id, label, key, type, value };
}

// Drops anything with no label/key (never legitimately created that way --
// see the "New" flow in control.js) and de-duplicates by key, first one
// wins, since the key is what a rule-set step's Data Field picker actually
// points at. Does NOT re-generate a key from a label; that only happens
// once, client-side, when a field is first created (see uniqueMetadataKey)
// -- the key freezes at creation by design, so a sanitizer re-deriving it
// from the (possibly since-changed) label would be a second, silent way
// for it to change out from under a rule set already pointing at it.
function sanitizeMetadataFields(input) {
  const list = Array.isArray(input) ? input : [];
  const seenKeys = new Set();
  const out = [];
  for (const raw of list) {
    if (out.length >= METADATA_FIELD_LIMITS.maxFields) break;
    const field = sanitizeMetadataField(raw);
    if (!field.label || !field.key || seenKeys.has(field.key)) continue;
    seenKeys.add(field.key);
    out.push(field);
  }
  return out;
}

const APP_WINDOW_LIMITS = { maxWindows: 20, maxLabelLen: 40, maxMatchLen: 100 };

// Windows of OTHER applications, captured into OBS and kept pointed at as
// the app reopens (window IDs change every launch, so a saved ID would go
// stale). Studio doesn't own these windows -- it can't open, move, dock or
// mute them -- so this is deliberately not a "view": it's just a saved way
// to find the window again (matchApp/matchTitle, compared as
// case-insensitive substrings against OBS's own window list) plus the name
// of the OBS source Studio manages for it.
function sanitizeAppCrop(input) {
  const c = input && typeof input === 'object' ? input : {};
  const edge = (v) => clamp(toInt(v, 0), 0, 10000);
  return { left: edge(c.left), top: edge(c.top), right: edge(c.right), bottom: edge(c.bottom) };
}

function sanitizeAppWindow(input, index) {
  const src = input && typeof input === 'object' ? input : {};
  const label = typeof src.label === 'string' && src.label.trim() ? src.label.trim().slice(0, APP_WINDOW_LIMITS.maxLabelLen) : `App ${index + 1}`;
  const text = (v) => (typeof v === 'string' ? v.trim().slice(0, APP_WINDOW_LIMITS.maxMatchLen) : '');
  const rawName = typeof src.sourceName === 'string' ? src.sourceName.trim().slice(0, 200) : '';
  return {
    id: sanitizeId(src.id, `app${index + 1}`),
    label,
    matchApp: text(src.matchApp),
    matchTitle: text(src.matchTitle),
    // The exact label of the window that was picked from the list, tried
    // before the looser app/title match (see findAppWindowChoice, obs.js).
    windowLabel: typeof src.windowLabel === 'string' ? src.windowLabel.slice(0, 300) : '',
    // Trimmed off each edge of the captured window, in captured pixels (twice
    // the point size on a Retina display) -- e.g. a top value to drop the
    // title bar. OBS has no "hide title bar" option; a crop is the only way.
    crop: sanitizeAppCrop(src.crop),
    showCursor: Boolean(src.showCursor),
    sourceName: rawName || defaultAppSourceName(label),
  };
}

function sanitizeAppWindows(input) {
  const list = Array.isArray(input) ? input : [];
  const seenIds = new Set();
  const seenNames = new Set();
  const out = [];
  for (const raw of list) {
    if (out.length >= APP_WINDOW_LIMITS.maxWindows) break;
    const w = sanitizeAppWindow(raw, out.length);
    let id = w.id;
    let n = 2;
    while (seenIds.has(id)) id = `${w.id}-${n++}`;
    seenIds.add(id);
    // Two app windows can't share one OBS source -- the second would fight
    // the first over where it points.
    if (seenNames.has(w.sourceName)) continue;
    seenNames.add(w.sourceName);
    out.push({ ...w, id });
  }
  return out;
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
    // No metadata fields on a fresh install -- created by hand via "New" on
    // the Session tab's Metadata card.
    metadataFields: [],
    appWindows: [],
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
    session: sanitizeSessionGroup(src.session),
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
    youtube: sanitizeYoutube(src.youtube),
    session: sanitizeSession(src.session),
    metadataFields: sanitizeMetadataFields(src.metadataFields),
    appWindows: sanitizeAppWindows(src.appWindows),
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
  RESERVED_FIELD_KEYS,
  METADATA_FIELD_LIMITS,
};
