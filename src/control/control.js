'use strict';

const api = window.coffeePub;

const $ = (id) => document.getElementById(id);
const viewsEl = $('views');
const viewTabsEl = $('view-tabs');
const template = $('view-template');
const saveStateEl = $('save-state');
const menuBarIconEl = $('menu-bar-icon');
const wakeDelayEl = $('wake-delay');
const wakeDelayValueEl = $('wake-delay-value');
const describeDelay = (s) => (s < 60 ? `${s} s` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min ${s % 60} s`);
const hideDockIconEl = $('hide-dock-icon');
const retinaDoubleEl = $('retina-double');
const arrangeDisplayEl = $('arrange-display');
const retinaHintEl = $('retina-hint');
const obsHostEl = $('obs-host');
const obsPortEl = $('obs-port');
const obsPasswordEl = $('obs-password');
const obsStatusEl = $('obs-status');
const obsTagEl = $('obs-tag');
const obsDotEl = $('obs-dot');
const obsConnectEl = $('obs-connect');
const obsAutoEl = $('obs-auto');
const collapseEl = $('collapse');
const dockEnabledEl = $('dock-enabled');
const dockSideEl = $('dock-side');
const dockOverlapEl = $('dock-overlap');
const sessionSeasonEl = $('session-season');
const sessionEpisodeEl = $('session-episode');
const sessionEpisodeIncrementEl = $('session-episode-increment');
const sessionEpisodeSourceEl = $('session-episode-source');
const sessionEpisodeFormatEl = $('session-episode-format');
const sessionFilenameEnabledEl = $('session-filename-enabled');
const sessionFilenameFormatEl = $('session-filename-format');
const sessionFilenamePreviewEl = $('session-filename-preview');
const metadataEls = {
  add: $('metadata-add'),
  addForm: $('metadata-add-form'),
  newLabel: $('metadata-new-label'),
  newType: $('metadata-new-type'),
  addConfirm: $('metadata-add-confirm'),
  addCancel: $('metadata-add-cancel'),
  fields: $('metadata-fields'),
  fieldsEmpty: $('metadata-fields-empty'),
};

// A live preview of what applySessionFilename would actually write, mirroring
// formatSessionTemplate in src/main.js: {season}/{episode} from the Season/
// Episode fields above (zero-padded, same as the real thing), {title}/
// {campaign} shown as placeholders since there's no triggering event to read
// them from here, and OBS's own %-style macros left untouched either way.
// Mirrors resolveDataField in src/main.js, read-only -- a preview must
// never actually mutate a Number field or the episode counter just because
// its format string happens to be visible on screen. {season}/{episode}/
// {title}/{campaign} keep their own fixed meaning (matching
// formatSessionTemplate's own legacy aliases); any other {name} is looked
// up the same way a Data Field picker's options are built (evergreen,
// Season/Episode, then config.metadataFields), showing (name) when nothing
// matches -- same spirit as the (title)/(campaign) placeholders below,
// which truly have no value to show here since there's no triggering event
// on this tab.
function previewDataField(key) {
  const match = /^(.+)([+-]1)$/.exec(key);
  const baseKey = match ? match[1] : key;
  const delta = match ? (match[2] === '+1' ? 1 : -1) : 0;
  const pad2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');

  const now = new Date();
  if (baseKey === 'sessionTime') return now.toLocaleTimeString();
  if (baseKey === 'sessionDate') return now.toLocaleDateString();
  if (baseKey === 'sessionDay') return now.toLocaleDateString(undefined, { weekday: 'long' });
  if (baseKey === 'sessionMonth') return now.toLocaleDateString(undefined, { month: 'long' });
  if (baseKey === 'sessionYear') return String(now.getFullYear());
  if (baseKey === 'sessionSeasonNumber') return pad2((Number(sessionSeasonEl.value) || 0) + delta);
  if (baseKey === 'sessionEpisodeNumber') return pad2((Number(sessionEpisodeEl.value) || 0) + delta);

  const field = ((config && config.metadataFields) || []).find((f) => f.key === baseKey);
  if (field) return field.type === 'number' && delta ? String(Number(field.value) + delta) : String(field.value);

  return `(${key})`;
}

function updateFilenamePreview() {
  const pad2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  const legacy = {
    season: pad2(sessionSeasonEl.value),
    episode: pad2(sessionEpisodeEl.value),
    title: '(title)',
    campaign: '(campaign)',
  };
  const format = sessionFilenameFormatEl.value;
  sessionFilenamePreviewEl.textContent = format
    ? `Preview: ${format.replace(/\{([A-Za-z][A-Za-z0-9]*(?:[+-]1)?)\}/g, (_match, key) =>
        Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : previewDataField(key)
      )}`
    : '';
}

// Kept in lockstep with sanitizeMetadataField's key generation in
// src/config.js -- generated once here, client-side, when "Add" is
// clicked, since the renderer already holds every existing key locally
// (same reasoning as a rule set's own id, generated the same way).
// config.js's sanitizer re-validates shape/limits/dedup on save as a
// backstop, but deliberately never regenerates a key from a label -- the
// key freezes at creation (see the Metadata card's own hint text); a
// sanitizer re-deriving it from a since-changed label would be a second,
// silent way for it to drift out from under a rule set already using it.
function slugMetadataKey(label) {
  const words = String(label || '').match(/[A-Za-z0-9]+/g) || [];
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  return `session${pascal || 'Field'}`;
}

function uniqueMetadataKey(label) {
  const taken = new Set([...RESERVED_FIELD_KEYS, ...((config && config.metadataFields) || []).map((f) => f.key)]);
  const base = slugMetadataKey(label);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

function renderMetadataFields() {
  const fields = (config && config.metadataFields) || [];
  metadataEls.fields.textContent = '';
  metadataEls.fieldsEmpty.hidden = fields.length > 0;
  for (const field of fields) {
    const row = document.createElement('div');
    row.className = 'metadata-field-row';

    const label = document.createElement('span');
    label.className = 'metadata-field-label';
    label.textContent = `${field.label}:`;

    const valueInput = document.createElement('input');
    valueInput.type = field.type === 'number' ? 'number' : 'text';
    valueInput.className = 'metadata-field-value';
    valueInput.value = field.value;
    valueInput.spellcheck = false;
    valueInput.addEventListener('change', () => {
      config.metadataFields = config.metadataFields.map((f) =>
        f.id === field.id ? { ...f, value: field.type === 'number' ? Number(valueInput.value) || 0 : valueInput.value } : f
      );
      updateFilenamePreview();
      scheduleSave();
    });

    const key = document.createElement('span');
    key.className = 'metadata-field-key hint';
    key.textContent = `(data field: ${field.key})`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-small btn-icon btn-danger';
    remove.title = 'Delete';
    remove.setAttribute('aria-label', 'Delete');
    remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    remove.addEventListener('click', () => {
      config.metadataFields = config.metadataFields.filter((f) => f.id !== field.id);
      renderMetadataFields();
      updateFilenamePreview();
      scheduleSave();
    });

    row.append(label, valueInput, key, remove);
    metadataEls.fields.appendChild(row);
  }
}

metadataEls.add.addEventListener('click', () => {
  metadataEls.addForm.hidden = false;
  metadataEls.newLabel.value = '';
  metadataEls.newType.value = 'text';
  metadataEls.newLabel.focus();
});
metadataEls.addCancel.addEventListener('click', () => {
  metadataEls.addForm.hidden = true;
});
metadataEls.addConfirm.addEventListener('click', () => {
  const label = metadataEls.newLabel.value.trim();
  if (!label) {
    metadataEls.newLabel.focus();
    return;
  }
  const type = metadataEls.newType.value === 'number' ? 'number' : 'text';
  const field = {
    id: `field${Date.now().toString(36)}`,
    label: label.slice(0, 60),
    key: uniqueMetadataKey(label),
    type,
    value: type === 'number' ? 0 : '',
  };
  config.metadataFields = [...(config.metadataFields || []), field];
  metadataEls.addForm.hidden = true;
  renderMetadataFields();
  updateFilenamePreview();
  scheduleSave();
});

let config = null;
let status = {
  views: [],
  displays: [],
  obs: { state: 'disconnected', inputs: [] },
  automations: { state: 'stopped', message: '', port: 0, addresses: [], events: [] },
  collapsed: false,
};
let limits = { minViews: 1, maxViews: 5 };
/** @type {Map<string, HTMLElement>} */
const cards = new Map();
let saveTimer = null;
let activeTab = 'session';

const NUMBER_FIELDS = new Set(['width', 'height']);
const BOOL_FIELDS = new Set(['enabled', 'dockOnLaunch', 'muted', 'wakeAudio']);

function setSaveState(text, cls = '') {
  saveStateEl.textContent = text;
  saveStateEl.className = cls;
}

function isDirty() {
  return saveStateEl.classList.contains('dirty');
}

function isEditing(el) {
  return el.contains(document.activeElement);
}

function reportError(err) {
  setSaveState(String((err && err.message) || err).replace(/^.*Error: /, ''), 'error');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function rememberTab(name) {
  try {
    localStorage.setItem('activeTab', name);
  } catch (err) {
    // ignore
  }
}

function recallTab() {
  try {
    return localStorage.getItem('activeTab') || 'session';
  } catch (err) {
    return 'session';
  }
}

function selectTab(name) {
  if (name === 'general' || name === 'obs') name = 'session';
  if (name.startsWith('view:') && !config.views.some((v) => `view:${v.id}` === name)) name = 'session';
  if (name === 'tavern' && !config.tavern.enabled) name = 'session';
  if (name === 'automations' && !config.automations.enabled) name = 'session';
  activeTab = name;
  rememberTab(name);
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  $('tab-session').hidden = name !== 'session';
  $('tab-tavern').hidden = name !== 'tavern';
  $('tab-automations').hidden = name !== 'automations';
  if (name === 'automations') refreshAutomationsScenes();
  for (const [id, card] of cards) card.hidden = name !== `view:${id}`;
  refreshStatusBar();
}

function renderTabs() {
  viewTabsEl.textContent = '';
  for (const view of config.views) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.dataset.tab = `view:${view.id}`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.dataset.viewDot = view.id;
    tab.appendChild(dot);
    tab.append(view.label);
    viewTabsEl.appendChild(tab);
  }
  $('tabs').querySelector('.tab-add').hidden = config.views.length >= limits.maxViews;
  selectTab(activeTab);
}

$('tabs').addEventListener('click', async (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  if (tab.dataset.tab === 'add') {
    await flushSave();
    try {
      const view = await api.addView();
      // The status broadcast may have re-rendered the tabs already.
      activeTab = `view:${view.id}`;
      selectTab(activeTab);
    } catch (err) {
      reportError(err);
    }
    return;
  }
  selectTab(tab.dataset.tab);
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderViewCards() {
  viewsEl.textContent = '';
  cards.clear();
  for (const view of config.views) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.viewId = view.id;
    cards.set(view.id, card);
    fillCard(card, view);
    card.addEventListener('input', onFieldInput);
    card.addEventListener('change', onFieldInput);
    card.addEventListener('click', onCardClick);
    const wsCard = card.querySelector('[data-role="window-source"]');
    wsCard.addEventListener('input', onWindowSourceInput);
    wsCard.addEventListener('change', onWindowSourceInput);
    viewsEl.appendChild(card);
  }
  renderLabelWarnings();
  renderTabs();
}

function fillCard(card, view) {
  card.querySelector('.view-title').textContent = `${view.label} window`;
  for (const input of card.querySelectorAll('[data-field]')) {
    const field = input.dataset.field;
    if (BOOL_FIELDS.has(field)) {
      input.checked = Boolean(view[field]);
    } else {
      input.value = view[field] === null || view[field] === undefined ? '' : String(view[field]);
    }
  }
}

// Apply a config coming from the main process without disturbing the field
// the user is typing in. Re-renders the cards if the set of windows changed.
function applyConfig(next) {
  const sameViews =
    config &&
    config.views.length === next.views.length &&
    config.views.every((v, i) => v.id === next.views[i].id && v.label === next.views[i].label);
  const firstLoad = !config;
  config = next;
  menuBarIconEl.checked = config.menuBarIcon;
  if (document.activeElement !== wakeDelayEl) wakeDelayEl.value = String(config.wakeAudioDelay);
  wakeDelayValueEl.textContent = describeDelay(config.wakeAudioDelay);
  dockEnabledEl.checked = config.dock.enabled;
  dockSideEl.value = config.dock.side;
  dockSideEl.disabled = !config.dock.enabled;
  if (document.activeElement !== dockOverlapEl) dockOverlapEl.value = String(config.dock.overlap);
  renderSessionGroups();
  hideDockIconEl.checked = config.hideDockIcon;
  hideDockIconEl.disabled = !config.menuBarIcon;
  retinaDoubleEl.checked = config.retinaDouble;
  obsAutoEl.checked = config.obs.autoConnect;
  if (document.activeElement !== obsHostEl) obsHostEl.value = config.obs.host;
  if (document.activeElement !== obsPortEl) obsPortEl.value = String(config.obs.port);
  if (document.activeElement !== sessionSeasonEl) sessionSeasonEl.value = String(config.session.season);
  if (document.activeElement !== sessionEpisodeEl) sessionEpisodeEl.value = String(config.session.episode);
  if (document.activeElement !== sessionEpisodeSourceEl) sessionEpisodeSourceEl.value = config.session.episodeSourceName;
  if (document.activeElement !== sessionEpisodeFormatEl) sessionEpisodeFormatEl.value = config.session.episodeFormat;
  sessionFilenameEnabledEl.checked = config.session.filenameFormatEnabled;
  if (document.activeElement !== sessionFilenameFormatEl) sessionFilenameFormatEl.value = config.session.filenameFormat;
  sessionFilenameFormatEl.disabled = !config.session.filenameFormatEnabled;
  updateFilenamePreview();
  renderMetadataFields();
  applyTavernConfig();
  applyAutomationsConfig(firstLoad);
  if (!sameViews) {
    renderViewCards();
    return;
  }
  for (const view of config.views) {
    const card = cards.get(view.id);
    if (card && !isEditing(card)) fillCard(card, view);
  }
  renderLabelWarnings();
}

function renderSessionGroups() {
  const list = $('session-groups');
  list.textContent = '';
  const names = new Set(['Main', ...config.views.map((v) => v.session).filter(Boolean)]);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    list.appendChild(option);
  }
}

function renderLabelWarnings() {
  const counts = new Map();
  for (const view of config.views) {
    const key = view.label.trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const view of config.views) {
    const card = cards.get(view.id);
    if (!card) continue;
    card.querySelector('[data-role="label-warning"]').hidden = counts.get(view.label.trim().toLowerCase()) < 2;
  }
}

function renderDisplays() {
  // Prefer the current selection, then the remembered one from the config.
  const previous = arrangeDisplayEl.value || (config && config.arrangeDisplayId !== null ? String(config.arrangeDisplayId) : '');
  arrangeDisplayEl.textContent = '';
  for (const display of status.displays) {
    const option = document.createElement('option');
    option.value = String(display.id);
    const scale = display.scaleFactor !== 1 ? ` @${display.scaleFactor}x` : '';
    option.textContent = `${display.label}${display.primary ? ' (main)' : ''} - ${display.bounds.width}x${display.bounds.height}${scale}`;
    arrangeDisplayEl.appendChild(option);
  }
  if ([...arrangeDisplayEl.options].some((o) => o.value === previous)) {
    arrangeDisplayEl.value = previous;
  }
  const hiDpi = status.displays.filter((d) => d.scaleFactor > 1);
  if (!hiDpi.length) {
    retinaHintEl.textContent = 'No Retina display: window size and captured pixel size match.';
  } else if (config && config.retinaDouble) {
    retinaHintEl.textContent = `Retina: OBS captures ${hiDpi[0].scaleFactor}x the pixels of the sizes here, and the app leaves its sources at that size.`;
  } else {
    retinaHintEl.textContent = `Retina: OBS captures ${hiDpi[0].scaleFactor}x the pixels of the sizes here, so the app scales its window and region sources by 1/${hiDpi[0].scaleFactor} in OBS to match.`;
  }
}

function renderObs() {
  const o = status.obs || { state: 'disconnected', inputs: [] };
  const connected = o.state === 'connected';
  const connecting = o.state === 'connecting';
  obsTagEl.hidden = !connected;
  obsDotEl.classList.toggle('on', connected);
  obsConnectEl.textContent = connected ? 'Disconnect' : connecting ? 'Connecting...' : 'Connect';
  obsConnectEl.disabled = connecting;
  obsConnectEl.classList.toggle('btn-primary', !connected && !connecting);
  const labels = {
    disconnected: o.message || 'Not connected.',
    connecting: o.message || 'Connecting...',
    connected: o.message || 'Connected.',
    error: o.message || 'Connection failed.',
  };
  let text = labels[o.state] || '';
  if (connected) {
    text += ` ${o.inputs.length} window-capture source${o.inputs.length === 1 ? '' : 's'} found.`;
    if (o.lastSync) {
      const bits = [];
      if (o.lastSync.pointed.length) bits.push(`re-pointed ${o.lastSync.pointed.join(', ')}`);
      if (o.lastSync.restarted && o.lastSync.restarted.length) bits.push(`restarted capture of ${o.lastSync.restarted.join(', ')}`);
      if (o.lastSync.cropped && o.lastSync.cropped.length) bits.push(`cropped ${o.lastSync.cropped.join(', ')}`);
      if (o.lastSync.detected.length) bits.push(`linked ${o.lastSync.detected.map((d) => d.input).join(', ')}`);
      if (o.lastSync.missing.length) bits.push(`missing in OBS: ${o.lastSync.missing.join(', ')}`);
      text += bits.length ? ` Last sync ${bits.join('; ')}.` : ' Last sync: everything already in place.';
    }
  }
  obsStatusEl.textContent = text;
  obsStatusEl.classList.toggle('hint-error', o.state === 'error');
  obsPasswordEl.placeholder = o.hasPassword ? 'saved' : 'not set';
  $('obs-sync').disabled = !connected;
}

// A chip's state/colour/label, from a service's own {state} shape and
// whether the feature is even turned on (OBS has no such toggle, so
// `enabled` is always true for it) -- one mapping shared by all three
// connections-board entries, so OBS/Tavern/Automations read consistently
// at a glance instead of each having its own bespoke wording.
function connectionChipState(state, enabled, listeningWord) {
  if (!enabled) return { cls: '', label: 'Off' };
  if (state === 'connected' || state === 'listening') return { cls: 'on', label: listeningWord || 'Connected' };
  if (state === 'connecting') return { cls: 'connecting', label: 'Connecting...' };
  if (state === 'error') return { cls: 'error', label: 'Error' };
  return { cls: '', label: 'Not connected' };
}

function renderConnectionsBoard() {
  const board = $('connections-board');
  const entries = {
    obs: connectionChipState((status.obs || {}).state, true),
    tavern: connectionChipState((status.tavern || {}).state, Boolean(config && config.tavern.enabled)),
    automations: connectionChipState(
      (status.automations || {}).state,
      Boolean(config && config.automations.enabled),
      'Listening'
    ),
  };
  for (const [key, { cls, label }] of Object.entries(entries)) {
    const chip = board.querySelector(`[data-connection="${key}"]`);
    if (!chip) continue;
    const dot = chip.querySelector('.dot');
    dot.classList.remove('on', 'connecting', 'error');
    if (cls) dot.classList.add(cls);
    chip.querySelector('.connection-state').textContent = label;
  }
  renderActivityLog(status.activity || []);
}

// The Connections card's log: state changes and errors from OBS, Tavern,
// and Automations, plus every automation event received -- one shared feed
// for troubleshooting a bad connection, fed by src/main.js's logActivity().
function renderActivityLog(events) {
  const list = $('connections-activity');
  const empty = $('connections-activity-empty');
  list.textContent = '';
  empty.hidden = events.length > 0;
  for (const e of events.slice(0, 50)) {
    const row = document.createElement('div');
    row.className = 'activity-row';
    if (e.level === 'error') row.classList.add('level-error');
    const time = document.createElement('span');
    time.className = 'activity-time';
    time.textContent = new Date(e.at).toLocaleTimeString();
    const source = document.createElement('span');
    source.className = 'activity-source';
    source.textContent = e.source;
    const text = document.createElement('span');
    text.className = 'activity-event';
    text.textContent = e.event;
    row.append(time, source, text);
    list.appendChild(row);
  }
}

function renderStatus() {
  const o = status.obs || { state: 'disconnected', inputs: [] };
  const connected = o.state === 'connected';
  collapseEl.textContent = status.collapsed ? 'Undock Windows' : 'Dock Windows';
  collapseEl.disabled = !status.views.some((v) => v.open);

  for (const view of config.views) {
    const card = cards.get(view.id);
    if (!card) continue;
    const s = status.views.find((v) => v.id === view.id) || { open: false };

    const dot = document.querySelector(`[data-view-dot="${view.id}"]`);
    if (dot) dot.classList.toggle('on', Boolean(s.open));

    const tag = card.querySelector('[data-role="tag"]');
    tag.hidden = !s.open;
    tag.textContent = s.open && s.loading ? 'LOADING' : 'ACTIVE';
    tag.classList.toggle('tag-loading', Boolean(s.open && s.loading));

    const toggle = card.querySelector('[data-action="toggle"]');
    toggle.textContent = s.open ? 'Stop' : 'Start';
    toggle.classList.toggle('btn-primary', !s.open);
    toggle.classList.toggle('btn-danger', s.open);
    toggle.disabled = !s.open && !view.url;
    toggle.title = !s.open && !view.url ? 'Enter a URL first' : '';
    card.querySelector('[data-action="reload"]').disabled = !s.open;
    card.querySelector('[data-action="reset"]').disabled = !s.open;
    card.querySelector('[data-action="devtools"]').disabled = !s.open;
    card.querySelector('[data-role="session-note"]').hidden = !s.open;
    card.querySelector('[data-action="remove-view"]').disabled = config.views.length <= limits.minViews;

    const size = s.open ? `${s.width} × ${s.height}` : `${view.width} × ${view.height}`;
    const captured = s.open && s.scaleFactor !== 1 ? ` (${s.captureWidth} × ${s.captureHeight} captured)` : '';
    card.querySelector('[data-status="title"]').textContent = `Coffee Pub Studio - ${view.label}  ·  page ${size}${captured}`;
    card.querySelector('[data-status="audio"]').textContent = !s.open
      ? 'Start the window to see whether its page is making sound.'
      : s.muted
        ? 'Muted here (Mute audio is ticked).'
        : s.audible
          ? 'Playing: the page is making sound right now.'
          : 'Silent right now. Nothing is playing, or the page is still waiting for a first interaction: click Wake audio, or click once inside the page.';
    card.querySelector('[data-action="wake-audio"]').disabled = !s.open;

    renderWindowSource(card, view, s, o, connected);
    renderRegions(card, view, s, o, connected);
  }
}

function makeChip(name, { missing = false, dim = false, title = '' } = {}) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  if (missing) chip.classList.add('chip-missing');
  if (dim) chip.classList.add('chip-dim');
  if (title) chip.title = title;
  chip.append(name);
  return chip;
}

function makeSmallButton(text, action, { danger = false, disabled = false, title = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-small${danger ? ' btn-danger' : ''}`;
  button.textContent = text;
  button.dataset.action = action;
  button.disabled = disabled;
  if (title) button.title = title;
  return button;
}

// The whole window as one OBS source: a switch, its name, and its state in
// OBS (in OBS -> Delete from OBS; not there -> Add to OBS).
// The name field only ever edits the part between "Window: " and
// " (CP Studio)" -- Studio composes the rest, always, on save. A name that
// doesn't match (a legacy name, or one adopted from a hand-made OBS
// source) shows raw and unwrapped until the user next edits and saves it.
const WINDOW_SOURCE_NAME_RE = /^Window: (.*) \(CP Studio\)$/;
const windowSourceName = (label) => `Window: ${label} (CP Studio)`;

function renderWindowSource(card, view, s, o, connected) {
  const el = card.querySelector('[data-role="window-source"]');
  const ws = view.windowSource;
  if (!isEditing(el)) {
    el.querySelector('[data-wfield="enabled"]').checked = ws.enabled;
    const match = WINDOW_SOURCE_NAME_RE.exec(ws.name);
    el.querySelector('[data-role="name-prefix"]').hidden = !match;
    el.querySelector('[data-role="name-suffix"]').hidden = !match;
    el.querySelector('[data-wfield="name"]').value = match ? match[1] : ws.name;
  }
  el.classList.toggle('disabled', !ws.enabled);
  const obsEl = el.querySelector('[data-role="window-obs"]');
  obsEl.textContent = '';
  if (connected) {
    const exists = o.inputs.includes(ws.name);
    if (exists) {
      obsEl.appendChild(makeChip(ws.enabled ? 'in OBS' : 'in OBS, hidden', { title: ws.enabled ? 'Kept pointed at this window' : 'Hidden while the switch is off' }));
      obsEl.appendChild(makeSmallButton('Delete from OBS', 'remove-window-source', { danger: true, title: 'Delete this source in OBS' }));
    } else if (ws.enabled) {
      obsEl.appendChild(makeChip('not in OBS', { missing: true, title: 'No OBS source has this name yet' }));
      obsEl.appendChild(
        makeSmallButton('Add to OBS', 'add-window-source', {
          disabled: !s.open,
          title: s.open ? 'Create a window-capture source with this name in the current scene' : 'Start the window first',
        }),
      );
    } else {
      obsEl.appendChild(makeChip('off', { dim: true, title: 'Turn the switch on to add it to OBS' }));
    }
  } else {
    const label = document.createElement('span');
    label.className = 'hint';
    label.textContent = ws.enabled ? 'connect to OBS to add the source' : 'off';
    obsEl.appendChild(label);
  }
}

const windowSourceTimers = new Map();

async function onWindowSourceInput(event) {
  if (!event.target.matches('[data-wfield]')) return;
  const el = event.currentTarget;
  const viewId = el.closest('.view-tab').dataset.viewId;
  const view = config.views.find((v) => v.id === viewId);
  if (!view) return;
  const field = event.target.dataset.wfield;
  if (field === 'enabled') {
    if (event.type !== 'change') return;
    view.windowSource.enabled = event.target.checked;
    el.classList.toggle('disabled', !event.target.checked);
    try {
      view.windowSource = await api.setWindowSource(viewId, { enabled: event.target.checked });
    } catch (err) {
      reportError(err);
    }
    return;
  }
  // The name saves shortly after typing stops, or as soon as the field is left.
  clearTimeout(windowSourceTimers.get(viewId));
  windowSourceTimers.set(viewId, setTimeout(() => commitWindowSourceName(viewId), 500));
}

// Saves the typed name; an empty name keeps the old one.
async function commitWindowSourceName(viewId) {
  clearTimeout(windowSourceTimers.get(viewId));
  windowSourceTimers.delete(viewId);
  const card = cards.get(viewId);
  const view = config.views.find((v) => v.id === viewId);
  if (!card || !view) return;
  const input = card.querySelector('[data-wfield="name"]');
  const typed = input.value.trim();
  if (!typed) return;
  // Always compose the full name from what's typed -- the wrapper is never
  // optional, whatever was there before (matching the pattern or not).
  const name = windowSourceName(typed);
  if (name === view.windowSource.name) return;
  try {
    view.windowSource = await api.setWindowSource(viewId, { name });
  } catch (err) {
    reportError(err);
    const match = WINDOW_SOURCE_NAME_RE.exec(view.windowSource.name);
    input.value = match ? match[1] : view.windowSource.name;
  }
}

const REGION_NUMBER_FIELDS = new Set(['x', 'y', 'width', 'height']);
const regionTemplate = $('region-template');
const regionSaveTimers = new Map();

function regionCardFor(card, region) {
  let el = card.querySelector(`.region-card[data-region="${region.id}"]`);
  if (el) return el;
  el = regionTemplate.content.firstElementChild.cloneNode(true);
  el.dataset.region = region.id;
  for (const radio of el.querySelectorAll('[data-rfield="mode"]')) radio.name = `mode-${card.dataset.viewId}-${region.id}`;
  el.addEventListener('input', onRegionInput);
  el.addEventListener('change', onRegionInput);
  card.querySelector('[data-role="region-list"]').appendChild(el);
  return el;
}

function fillRegionCard(el, region) {
  for (const input of el.querySelectorAll('[data-rfield]')) {
    const field = input.dataset.rfield;
    if (field === 'enabled') input.checked = region.enabled;
    else if (field === 'mode') input.checked = input.value === region.mode;
    else input.value = region[field] === undefined || region[field] === null ? '' : String(region[field]);
  }
  el.classList.toggle('disabled', !region.enabled);
  el.querySelector('[data-role="selector-row"]').hidden = region.mode !== 'selector';
}

function renderRegions(card, view, s, o, connected) {
  const list = card.querySelector('[data-role="region-list"]');
  const keep = new Set(view.regions.map((r) => r.id));
  for (const el of [...list.querySelectorAll('.region-card')]) {
    if (!keep.has(el.dataset.region)) el.remove();
  }
  for (const region of view.regions) {
    const el = regionCardFor(card, region);
    if (!isEditing(el)) fillRegionCard(el, region);
    // The prefix is the window's own label, not something the region name
    // field edits -- the composed result is what "Add to OBS" actually uses.
    el.querySelector('[data-role="name-prefix"]').textContent = `Region: ${view.label}>`;

    const obsEl = el.querySelector('[data-role="region-obs"]');
    obsEl.textContent = '';
    if (connected) {
      const exists = region.obsSource && o.inputs.includes(region.obsSource);
      if (exists) {
        obsEl.appendChild(makeChip(region.obsSource, { title: 'OBS source' }));
        obsEl.appendChild(makeSmallButton('Delete from OBS', 'remove-region-source', { danger: true, title: 'Delete this source in OBS' }));
      } else {
        obsEl.appendChild(
          makeSmallButton('Add to OBS', 'create-region-source', {
            disabled: !s.open,
            title: s.open
              ? region.obsSource
                ? `Re-create "${region.obsSource}" in OBS`
                : 'Create a cropped window-capture source for this region'
              : 'Start the window first',
          }),
        );
      }
    } else if (region.obsSource) {
      const label = document.createElement('span');
      label.className = 'region-source-name';
      label.textContent = region.obsSource;
      obsEl.appendChild(label);
    } else {
      const label = document.createElement('span');
      label.className = 'hint';
      label.textContent = 'connect to OBS to add a source';
      obsEl.appendChild(label);
    }
    el.querySelector('[data-action="pick-region"]').disabled = !s.open;
    el.querySelector('[data-action="measure-region"]').disabled = !s.open;
    el.querySelector('[data-role="region-note"]').textContent = s.open ? '' : 'Start the window to use the snapshot or Measure.';
  }
  const add = card.querySelector('[data-action="add-region"]');
  add.disabled = !s.open;
  add.title = s.open ? '' : 'Start the window first';
}

function readRegionCard(el, region) {
  const next = { ...region };
  for (const input of el.querySelectorAll('[data-rfield]')) {
    const field = input.dataset.rfield;
    if (field === 'enabled') continue; // handled through setRegionEnabled
    if (field === 'mode') {
      if (input.checked) next.mode = input.value;
    } else if (REGION_NUMBER_FIELDS.has(field)) {
      next[field] = Number(input.value);
    } else {
      next[field] = input.value;
    }
  }
  return next;
}

async function onRegionInput(event) {
  if (!event.target.matches('[data-rfield]')) return;
  const el = event.currentTarget;
  const card = el.closest('.view-tab');
  const viewId = card.dataset.viewId;
  const view = config.views.find((v) => v.id === viewId);
  const region = view && view.regions.find((r) => r.id === el.dataset.region);
  if (!region) return;
  if (event.target.dataset.rfield === 'enabled') {
    if (event.type !== 'change') return;
    try {
      await api.setRegionEnabled(viewId, region.id, event.target.checked);
    } catch (err) {
      reportError(err);
    }
    return;
  }
  Object.assign(region, readRegionCard(el, region));
  el.querySelector('[data-role="selector-row"]').hidden = region.mode !== 'selector';
  clearTimeout(regionSaveTimers.get(region.id));
  regionSaveTimers.set(
    region.id,
    setTimeout(async () => {
      try {
        await api.saveRegion(viewId, region);
      } catch (err) {
        reportError(err);
      }
    }, 400),
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function readCard(card, view) {
  const next = { ...view };
  for (const input of card.querySelectorAll('[data-field]')) {
    const field = input.dataset.field;
    if (BOOL_FIELDS.has(field)) {
      next[field] = input.checked;
    } else if (NUMBER_FIELDS.has(field)) {
      next[field] = input.value.trim() === '' ? null : Number(input.value);
    } else {
      next[field] = input.value;
    }
  }
  return next;
}

function onFieldInput(event) {
  if (!event.target.matches('[data-field]')) return;
  const card = event.currentTarget;
  const view = config.views.find((v) => v.id === card.dataset.viewId);
  if (!view) return;
  Object.assign(view, readCard(card, view));
  if (event.target.dataset.field === 'label') {
    card.querySelector('.view-title').textContent = `${view.label || 'Untitled'} window`;
    const tab = document.querySelector(`.tab[data-tab="view:${view.id}"]`);
    if (tab) tab.lastChild.textContent = view.label || 'Untitled';
    renderLabelWarnings();
  }
  scheduleSave();
}

async function onCardClick(event) {
  const id = event.currentTarget.dataset.viewId;
  const view = config.views.find((v) => v.id === id);
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (event.target.matches('[data-rfield], [data-wfield]')) return; // handled by onRegionInput / onWindowSourceInput
  const regionEl = event.target.closest('[data-region]');
  const regionId = regionEl ? regionEl.dataset.region : null;
  const region = regionId ? view.regions.find((r) => r.id === regionId) : null;
  await flushSave();
  await commitWindowSourceName(id);
  const s = status.views.find((v) => v.id === id) || { open: false };
  try {
    switch (button.dataset.action) {
      case 'toggle':
        if (s.open) await api.closeView(id);
        else await api.openView(id);
        break;
      case 'reload':
        await api.reloadView(id);
        break;
      case 'reset':
        await api.resetView(id);
        break;
      case 'devtools':
        await api.devToolsView(id);
        break;
      case 'wake-audio':
        await api.wakeAudioView(id);
        break;
      case 'add-window-source':
        await api.addWindowSource(id);
        break;
      case 'remove-window-source':
        if (window.confirm(`Delete "${view.windowSource.name}" from OBS?`)) {
          await api.obsRemoveSource(view.windowSource.name);
        }
        break;
      case 'remove-view':
        if (window.confirm(`Delete the "${view.label}" window and its settings?`)) {
          activeTab = 'session';
          await api.removeView(id);
        }
        break;
      case 'add-region': {
        const st = status.views.find((v) => v.id === id) || {};
        const w = st.width || view.width;
        const h = st.height || view.height;
        await api.saveRegion(id, {
          name: `Region ${view.regions.length + 1}`,
          mode: 'rect',
          x: 0,
          y: 0,
          width: Math.max(1, Math.round(w / 2)),
          height: Math.max(1, Math.round(h / 2)),
        });
        break;
      }
      case 'pick-region':
        await openPicker(id, region);
        break;
      case 'measure-region': {
        const el = regionEl;
        const out = el.querySelector('[data-role="measure-out"]');
        const selector = el.querySelector('[data-rfield="selector"]').value;
        const rect = await api.measureView(id, selector).catch(() => null);
        if (!rect) {
          out.textContent = 'Element not found in the page.';
          out.className = 'field-warning';
          break;
        }
        out.textContent = `Found: ${rect.x}, ${rect.y}  ·  ${rect.width} × ${rect.height}`;
        out.className = 'hint';
        for (const key of ['x', 'y', 'width', 'height']) el.querySelector(`[data-rfield="${key}"]`).value = String(rect[key]);
        Object.assign(region, rect, { mode: 'selector', selector });
        await api.saveRegion(id, region);
        break;
      }
      case 'delete-region':
        if (region && window.confirm(`Delete region "${region.name}"? Its OBS source, if any, stays in OBS.`)) {
          await api.removeRegion(id, regionId);
        }
        break;
      case 'create-region-source':
        await api.obsCreateRegionSource(id, regionId);
        break;
      case 'remove-region-source':
        if (region && window.confirm(`Delete "${region.obsSource}" from OBS?`)) {
          await api.obsRemoveSource(region.obsSource);
        }
        break;
      default:
        break;
    }
  } catch (err) {
    reportError(err);
  }
}

function scheduleSave() {
  setSaveState('Unsaved changes...', 'dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!isDirty()) return;
  try {
    config.menuBarIcon = menuBarIconEl.checked;
    config.hideDockIcon = hideDockIconEl.checked;
    config.retinaDouble = retinaDoubleEl.checked;
    config.wakeAudioDelay = Number(wakeDelayEl.value);
    config.dock = { enabled: dockEnabledEl.checked, side: dockSideEl.value === 'left' ? 'left' : 'right', overlap: Number(dockOverlapEl.value) };
    if (arrangeDisplayEl.value) config.arrangeDisplayId = Number(arrangeDisplayEl.value);
    config.session = {
      season: Number(sessionSeasonEl.value) || 0,
      episode: Number(sessionEpisodeEl.value) || 0,
      episodeSourceName: sessionEpisodeSourceEl.value,
      episodeFormat: sessionEpisodeFormatEl.value,
      filenameFormat: sessionFilenameFormatEl.value,
      filenameFormatEnabled: sessionFilenameEnabledEl.checked,
    };
    const saved = await api.saveConfig(config);
    setSaveState('All changes saved');
    applyConfig(saved);
    renderStatus();
  } catch (err) {
    setSaveState(`Save failed: ${err.message}`, 'error');
  }
}

$('open-all').addEventListener('click', async () => {
  await flushSave();
  await api.openAll();
});
$('close-all').addEventListener('click', () => api.closeAll());
collapseEl.addEventListener('click', () => (status.collapsed ? api.expandViews() : api.collapseViews()));
$('arrange').addEventListener('click', async () => {
  await flushSave();
  await api.arrangeViews(Number(arrangeDisplayEl.value));
});
arrangeDisplayEl.addEventListener('change', () => {
  config.arrangeDisplayId = Number(arrangeDisplayEl.value);
  scheduleSave();
});
for (const el of [menuBarIconEl, hideDockIconEl, retinaDoubleEl, dockEnabledEl, dockSideEl, dockOverlapEl, wakeDelayEl, sessionSeasonEl, sessionEpisodeEl, sessionEpisodeSourceEl, sessionEpisodeFormatEl, sessionFilenameEnabledEl, sessionFilenameFormatEl]) el.addEventListener('change', scheduleSave);
wakeDelayEl.addEventListener('input', () => {
  wakeDelayValueEl.textContent = describeDelay(Number(wakeDelayEl.value));
});
for (const el of [sessionSeasonEl, sessionEpisodeEl, sessionFilenameFormatEl]) el.addEventListener('input', updateFilenamePreview);
sessionEpisodeIncrementEl.addEventListener('click', () => {
  sessionEpisodeEl.value = String((Number(sessionEpisodeEl.value) || 0) + 1);
  updateFilenamePreview();
  scheduleSave();
});
$('clear-session').addEventListener('click', () => api.clearSession());
$('reveal-config').addEventListener('click', () => api.revealConfig());
$('reset-config').addEventListener('click', async () => {
  if (!window.confirm('Reset URLs, sizes and positions to the defaults?')) return;
  const saved = await api.resetConfig();
  setSaveState('All changes saved');
  activeTab = 'session';
  applyConfig(saved);
  renderStatus();
});

// --- OBS ---
async function saveObsSettings() {
  await flushSave();
  const next = {
    autoConnect: obsAutoEl.checked,
    host: obsHostEl.value.trim() || '127.0.0.1',
    port: Number(obsPortEl.value) || 4455,
  };
  config.obs = { ...config.obs, ...next };
  status.obs = await api.obsSetSettings(next);
  renderObs();
}
obsHostEl.addEventListener('change', saveObsSettings);
obsPortEl.addEventListener('change', saveObsSettings);
obsAutoEl.addEventListener('change', saveObsSettings);
obsConnectEl.addEventListener('click', async () => {
  await flushSave();
  try {
    if (status.obs.state === 'connected') status.obs = await api.obsDisconnect();
    else status.obs = await api.obsConnect();
  } catch (err) {
    // The status line carries the reason.
  }
  renderObs();
  renderConnectionsBoard();
});
$('obs-save-password').addEventListener('click', async () => {
  status.obs = await api.obsSetPassword(obsPasswordEl.value);
  obsPasswordEl.value = '';
  $('obs-save-password').hidden = true;
  renderObs();
});
obsPasswordEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('obs-save-password').click();
});
obsPasswordEl.addEventListener('input', () => {
  $('obs-save-password').hidden = !obsPasswordEl.value;
});
$('obs-sync').addEventListener('click', async () => {
  try {
    await api.obsSync();
  } catch (err) {
    reportError(err);
  }
});

// Blur commits fields immediately so a shortcut right after typing uses the new value.
document.addEventListener('focusout', (event) => {
  if (!event.target || typeof event.target.matches !== 'function') return;
  if (event.target.matches('[data-field]') && saveTimer) flushSave();
  if (event.target.matches('[data-wfield="name"]')) {
    const tab = event.target.closest('.view-tab');
    if (tab) commitWindowSourceName(tab.dataset.viewId);
  }
});

api.onStatus((next) => {
  status = next;
  if (next.config && !isDirty()) applyConfig(next.config);
  renderDisplays();
  renderObs();
  renderStatus();
  renderTavern();
  renderAutomationsStatus();
  renderAutomationsObs();
  renderConnectionsBoard();
  const obsConnected = Boolean(next.obs && next.obs.state === 'connected');
  if (obsConnected && !automationsObsWasConnected) refreshAutomationsScenes();
  automationsObsWasConnected = obsConnected;
});

// ---------------------------------------------------------------------------
// Tavern
// ---------------------------------------------------------------------------

const tavernEls = {
  enabled: $('tavern-enabled'),
  settings: $('tavern-settings'),
  tab: $('tavern-tab'),
  url: $('tavern-url'),
  login: $('tavern-login'),
  password: $('tavern-password'),
  auto: $('tavern-auto'),
  width: $('tavern-width'),
  height: $('tavern-height'),
  lock: $('tavern-lock'),
  indicator: $('tavern-indicator'),
  statusWidth: $('tavern-status-width'),
  statusHeight: $('tavern-status-height'),
  connect: $('tavern-connect'),
  tag: $('tavern-tag'),
  dot: $('tavern-dot'),
  status: $('tavern-status'),
  participants: $('tavern-participants'),
  characters: $('tavern-characters'),
  empty: $('tavern-empty'),
  summary: $('tavern-summary'),
  title: $('tavern-title'),
};

// A Participant source and a Character source are independent OBS sources
// with their own switch, so they get their own section and their own row
// per user rather than one shared card. `field`/`sourceField` are the
// config keys on a tavern.players[key] entry; `viewKind` is the ?kind=
// param the Tavern server expects (still 'player' for back-compat).
const TAVERN_KINDS = {
  player: { field: 'player', sourceField: 'source', viewKind: 'player', thumbSlot: 'profile', label: 'Participant', otherLabel: 'Character', what: 'Their video, or their player image when the camera is off' },
  character: { field: 'character', sourceField: 'characterSource', viewKind: 'character', thumbSlot: 'character', label: 'Character', otherLabel: 'Participant', what: 'Their character image with the talking and muted images on top' },
};

/** @type {Map<string, HTMLElement>} */
const participantCards = new Map();
/** @type {Map<string, HTMLElement>} */
const characterCards = new Map();
const cardsFor = (kind) => (kind === 'character' ? characterCards : participantCards);
const containerFor = (kind) => (kind === 'character' ? tavernEls.characters : tavernEls.participants);

function applyTavernConfig() {
  const t = config.tavern;
  tavernEls.enabled.checked = t.enabled;
  tavernEls.settings.hidden = !t.enabled;
  tavernEls.tab.hidden = !t.enabled;
  $('tavern-manage').hidden = !t.enabled;
  $('tavern-connect').hidden = !t.enabled;
  if (!t.enabled && activeTab === 'tavern') selectTab('session');
  if (document.activeElement !== tavernEls.url) tavernEls.url.value = t.url;
  if (document.activeElement !== tavernEls.login) tavernEls.login.value = t.login;
  tavernEls.auto.checked = t.autoConnect;
  if (document.activeElement !== tavernEls.width) tavernEls.width.value = String(t.playerWidth);
  if (document.activeElement !== tavernEls.height) tavernEls.height.value = String(t.playerHeight);
  tavernEls.lock.checked = t.lockRatio;
  tavernEls.indicator.checked = t.characterWithPlayer;
  if (document.activeElement !== tavernEls.statusWidth) tavernEls.statusWidth.value = String(t.characterWidth);
  if (document.activeElement !== tavernEls.statusHeight) tavernEls.statusHeight.value = String(t.characterHeight);
}

// Constrain proportions: the camera is 16:9, so one side follows the other.
const RATIO_16_9 = 16 / 9;
tavernEls.width.addEventListener('input', () => {
  if (tavernEls.lock.checked && Number(tavernEls.width.value) > 0) tavernEls.height.value = String(Math.round(Number(tavernEls.width.value) / RATIO_16_9));
});
tavernEls.height.addEventListener('input', () => {
  if (tavernEls.lock.checked && Number(tavernEls.height.value) > 0) tavernEls.width.value = String(Math.round(Number(tavernEls.height.value) * RATIO_16_9));
});

async function saveTavernSettings() {
  await flushSave();
  const next = {
    enabled: tavernEls.enabled.checked,
    url: tavernEls.url.value.trim(),
    login: tavernEls.login.value.trim(),
    autoConnect: tavernEls.auto.checked,
    playerWidth: Number(tavernEls.width.value) || 640,
    playerHeight: Number(tavernEls.height.value) || 360,
    lockRatio: tavernEls.lock.checked,
    characterWithPlayer: tavernEls.indicator.checked,
    characterWidth: Number(tavernEls.statusWidth.value) || 256,
    characterHeight: Number(tavernEls.statusHeight.value) || 256,
  };
  if (next.lockRatio) next.playerHeight = Math.round(next.playerWidth / RATIO_16_9);
  config.tavern = { ...config.tavern, ...next };
  try {
    status.tavern = await api.tavernSetSettings(next);
  } catch (err) {
    reportError(err);
  }
  renderTavern();
  renderConnectionsBoard();
}
for (const el of [tavernEls.enabled, tavernEls.url, tavernEls.login, tavernEls.auto, tavernEls.width, tavernEls.height, tavernEls.lock, tavernEls.indicator, tavernEls.statusWidth, tavernEls.statusHeight]) {
  el.addEventListener('change', saveTavernSettings);
}
$('tavern-save-password').addEventListener('click', async () => {
  await saveTavernSettings();
  status.tavern = await api.tavernSetPassword(tavernEls.password.value);
  tavernEls.password.value = '';
  $('tavern-save-password').hidden = true;
  renderTavern();
});
tavernEls.password.addEventListener('input', () => {
  $('tavern-save-password').hidden = !tavernEls.password.value;
});
tavernEls.password.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('tavern-save-password').click();
});
tavernEls.connect.addEventListener('click', async () => {
  await saveTavernSettings();
  try {
    if (status.tavern.state === 'connected') status.tavern = await api.tavernDisconnect();
    else status.tavern = await api.tavernConnect();
  } catch (err) {
    // the status line carries the reason
  }
  renderTavern();
  renderConnectionsBoard();
});
$('tavern-manage').addEventListener('click', () => api.tavernOpenManage());
$('tavern-show-all').addEventListener('click', () => api.tavernShowAll().catch(reportError));
$('tavern-hide-all').addEventListener('click', () => api.tavernHideAll().catch(reportError));
$('tavern-publish-all').addEventListener('click', () => api.tavernPublishAll().catch(reportError));
$('tavern-unpublish-all').addEventListener('click', () => {
  if (!window.confirm('Delete every Tavern source from OBS?')) return;
  api.tavernUnpublishAll(true).catch(reportError);
});
$('tavern-sync').addEventListener('click', () => api.tavernSync().catch(reportError));
$('tavern-room').addEventListener('change', async () => {
  const room = $('tavern-room').value;
  $('tavern-room').blur();
  config.tavern.room = room;
  try {
    status.tavern = await api.tavernSetSettings({ room });
  } catch (err) {
    reportError(err);
  }
  renderTavern();
});
$('tavern-follow-admin').addEventListener('change', async () => {
  const followAdmin = $('tavern-follow-admin').checked;
  config.tavern.followAdmin = followAdmin;
  try {
    status.tavern = await api.tavernSetSettings({ followAdmin });
  } catch (err) {
    reportError(err);
  }
  renderTavern();
});

function tavernRowFor(user, kind) {
  const cards = cardsFor(kind);
  let card = cards.get(user.key);
  if (card) return card;
  card = $('tavern-row-template').content.firstElementChild.cloneNode(true);
  card.dataset.key = user.key;
  card.dataset.kind = kind;
  card.addEventListener('click', onTavernRowClick);
  cards.set(user.key, card);
  containerFor(kind).appendChild(card);
  return card;
}

function renderTavern() {
  const t = status.tavern || { state: 'disconnected', party: [], sync: { inputs: [] } };
  const connected = t.state === 'connected';
  const connecting = t.state === 'connecting';
  tavernEls.tag.hidden = !connected;
  tavernEls.dot.classList.toggle('on', connected);
  tavernEls.connect.textContent = connected ? 'Sign out' : connecting ? 'Signing in...' : 'Sign in';
  tavernEls.connect.disabled = connecting;
  tavernEls.connect.classList.toggle('btn-primary', !connected && !connecting);
  tavernEls.password.placeholder = t.hasPassword ? 'saved' : 'not set';
  $('tavern-manage').disabled = !config || !config.tavern.url;
  const labels = {
    disconnected: t.message || 'Not signed in.',
    connecting: t.message || 'Signing in...',
    connected: t.message || 'Signed in.',
    error: t.message || 'Sign-in failed.',
  };
  let text = labels[t.state] || '';
  if (connected && t.version) text += ` Server ${t.version}.`;
  tavernEls.status.textContent = text;
  tavernEls.status.classList.toggle('hint-error', t.state === 'error');

  // The room chooser: the Lobby and the rooms curated on the Tavern; the
  // users below are the chosen room's members. This is the room this OBS
  // session is showing, full stop -- a purely manual pick, never overridden
  // by wherever an admin happens to be live (that used to snap the dropdown
  // back to Lobby the moment no admin was online, which read as the room
  // randomly changing on its own).
  const rooms = connected ? t.rooms || [] : [];
  const chosenId = (config && config.tavern.room) || 'lobby';
  const room = rooms.find((r) => r.id === chosenId) || rooms.find((r) => r.isLobby) || rooms[0] || null;
  $('tavern-follow-admin').checked = Boolean(config && config.tavern.followAdmin);
  // Rebuild the list only when it changed, so a room added on the Tavern
  // shows up even while the chooser has focus. A "pull aside" room is never
  // hand-pickable -- it's transient and gone once everyone's left it.
  const select = $('tavern-room');
  const pickable = rooms.filter((r) => !r.ephemeral);
  const wanted = pickable.map((r) => `${r.id} ${r.isLobby ? `${r.name} (everyone)` : r.name}`);
  const have = [...select.options].map((o) => `${o.value} ${o.textContent}`);
  if (wanted.join('\n') !== have.join('\n')) {
    select.textContent = '';
    for (const r of pickable) {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = r.isLobby ? `${r.name} (everyone)` : r.name;
      select.appendChild(option);
    }
  }
  if (room && select.value !== room.id) select.value = room.id;
  select.disabled = !connected || pickable.length < 2;
  tavernEls.title.textContent = connected && room ? `${t.serverName}: ${room.name}` : 'Room';
  $('tavern-room-desc').textContent = room ? room.description : '';
  const roomImage = $('tavern-room-image');
  const roomImageUrl = room && room.hasImage ? `${t.url}/img/room/${encodeURIComponent(room.id)}?s=${encodeURIComponent(t.streamKey)}` : '';
  roomImage.hidden = !roomImageUrl;
  if (roomImageUrl && roomImage.dataset.src !== roomImageUrl) {
    roomImage.dataset.src = roomImageUrl;
    roomImage.src = roomImageUrl;
  }
  $('tavern-room-card').hidden = !connected;

  // The users of that room
  const party = connected && room ? t.party.filter((u) => room.members.includes(u.key)) : connected ? t.party : [];
  // OFF STREAM/ASIDE is relative to wherever the admin/GM actually is
  // (t.activeRoom), not the room dropdown above -- with no admin online
  // there's no "current conversation" to be off from, so don't tag anyone.
  const adminOnline = connected && t.party.some((u) => u.role === 'admin' && u.online);
  const published = (config && config.tavern.players) || {};
  const inputs = new Set((t.sync && t.sync.inputs) || []);
  const obsConnected = status.obs && status.obs.state === 'connected';
  $('tavern-users-title').textContent = room ? `Users in ${room.name}` : 'Users';
  $('tavern-room-count').textContent = room ? `${room.members.length} member${room.members.length === 1 ? '' : 's'}` : '';
  tavernEls.empty.hidden = connected;
  tavernEls.empty.textContent = t.state === 'error' ? t.message : 'Sign in to the Tavern on the Session tab to see who is at the table.';
  // A room's profile gates which sources it offers: 'participants' drops
  // Character, 'characters' drops Participant, 'roleplaying' (or no
  // profile, for an older server) offers both. Every user in `party` is a
  // member of this same `room`, so the gate applies uniformly below. A kind
  // the room doesn't offer isn't just unavailable per row -- the whole
  // section is irrelevant here, so it doesn't render at all. A leftover
  // source from before the room stopped offering that kind is still hidden
  // (not deleted) by syncTavern; cleaning it up means switching to a room
  // that does offer it, or Delete All from OBS.
  const allowedFor = { player: !room || room.profile !== 'characters', character: !room || room.profile !== 'participants' };
  $('tavern-participants-section').hidden = !connected || !allowedFor.player;
  $('tavern-characters-section').hidden = !connected || !allowedFor.character;
  // What each user gets: the ticks, defaulting to Participant on and
  // Character per the Session tab; the sources exist while they are published.
  const entryFor = (key) => {
    const e = published[key] || {};
    return {
      player: e.player === undefined ? true : e.player,
      character: e.character === undefined ? Boolean(config && config.tavern.characterWithPlayer) : e.character,
      source: e.source || '',
      characterSource: e.characterSource || '',
    };
  };
  const online = party.filter((u) => u.online).length;
  const inObs = party.filter((u) => isPublished(entryFor(u.key))).length;
  tavernEls.summary.textContent = connected ? `${online} of ${party.length} at the table, ${inObs} in OBS` : '';
  $('tavern-publish-all').disabled = !connected || party.every((u) => isPublished(entryFor(u.key)) || !(entryFor(u.key).player || entryFor(u.key).character));
  $('tavern-unpublish-all').disabled = !Object.keys(published).some((k) => isPublished(published[k]));
  $('tavern-hide-all').disabled = !connected || party.every((u) => { const e = entryFor(u.key); return !e.player && !e.character; });
  $('tavern-show-all').disabled = !connected || party.every((u) => { const e = entryFor(u.key); return (!e.source || e.player) && (!e.characterSource || e.character); });
  $('tavern-sync').disabled = !connected;

  const renderRow = (user, kind) => {
    const k = TAVERN_KINDS[kind];
    const card = tavernRowFor(user, kind);
    const entry = entryFor(user.key);
    const ticked = entry[k.field];
    const name = entry[k.sourceField];
    const allowed = allowedFor[kind];
    const thumb = card.querySelector('[data-role="thumb"]');
    thumb.alt = user.displayName;
    thumb.title = user.displayName;
    const thumbUrl = `${t.url}/img/${encodeURIComponent(user.key)}/${k.thumbSlot}?s=${encodeURIComponent(t.streamKey)}`;
    if (thumb.dataset.src !== thumbUrl) {
      thumb.dataset.src = thumbUrl;
      thumb.src = thumbUrl;
    }
    const dot = card.querySelector('[data-role="online"]');
    dot.classList.toggle('on', Boolean(user.online));
    dot.title = user.online ? 'at the table' : 'offline';
    const inRoom = user.online && user.online.room ? rooms.find((r) => r.id === user.online.room) : null;

    const micIcon = card.querySelector('[data-role="mic"]');
    micIcon.hidden = !user.online;
    micIcon.classList.toggle('on', Boolean(user.online && user.online.micOn));
    micIcon.title = user.online ? (user.online.micOn ? 'Mic on' : 'Mic off') : '';

    const videoIcon = card.querySelector('[data-role="video"]');
    videoIcon.hidden = !user.online;
    videoIcon.classList.toggle('on', Boolean(user.online && user.online.cameraOn));
    videoIcon.title = user.online ? (user.online.cameraOn ? 'Camera on' : 'Camera off') : '';

    // The room they're live in right now, not the room this list happens to
    // be showing -- the two can differ (a pull-aside, or just a different
    // room membership), and that gap is exactly what room-profile gating
    // needs to be visible, not implicit.
    const roomTag = card.querySelector('[data-role="room"]');
    roomTag.hidden = !inRoom;
    roomTag.textContent = inRoom ? inRoom.name : '';
    roomTag.classList.toggle('on', Boolean(inRoom && room && inRoom.id === room.id));

    card.querySelector('[data-role="offline"]').hidden = Boolean(user.online);

    // Off stream: online, but not in the room the admin/GM is actually in
    // right now -- not the dropdown's manual pick above, which is only for
    // Participant/Character gating. A pull-aside room is no different:
    // whoever's aside together is off stream same as any other room they
    // could have wandered into.
    const offStream = adminOnline && Boolean(user.online) && user.online.room !== t.activeRoom;
    const offStreamTag = card.querySelector('[data-role="off-stream"]');
    offStreamTag.hidden = !offStream;
    offStreamTag.textContent = inRoom && inRoom.ephemeral ? 'ASIDE' : 'OFF STREAM';
    const exists = obsConnected && Boolean(name) && inputs.has(name);
    // Gating never touches the tick, only OBS-side visibility (syncTavern
    // hides it, not unpublishes it) -- so something ticked on from before,
    // in a room that used to allow it, must NOT read as "live" once the
    // room no longer does. Otherwise the button keeps saying "Hide in OBS"
    // for a source the room already forced hidden, as if it were still a
    // normal working toggle.
    const live = Boolean(name) && ticked && allowed; // showing in OBS right now
    const blockedByGate = !allowed;

    const chips = card.querySelector('[data-role="chips"]');
    chips.textContent = '';
    if (name) {
      let title = k.what;
      if (!allowed) title = `Hidden: this room offers ${k.otherLabel} sources only`;
      else if (!ticked) title = 'Hidden; still assigned this name for next time';
      else if (!exists) title = obsConnected ? 'Not in OBS yet; Sync OBS creates it' : 'OBS is not connected';
      const chip = makeChip(name, { missing: obsConnected && !exists, dim: !allowed || !ticked, title });
      chip.classList.add(user.online ? 'chip-user-online' : 'chip-user-offline');
      chips.appendChild(chip);
    }

    const toggleBtn = card.querySelector('[data-action="toggle"]');
    toggleBtn.hidden = blockedByGate;
    toggleBtn.textContent = live ? 'Hide in OBS' : exists ? 'Show in OBS' : 'Add to OBS';
    toggleBtn.classList.toggle('btn-primary', !live);
    toggleBtn.title = live
      ? 'Hide this source (kept in OBS, ready to show again)'
      : exists
        ? 'Show this source again in OBS'
        : 'Create this source in OBS';

    const removeBtn = card.querySelector('[data-action="remove-source"]');
    removeBtn.hidden = !exists;
  };

  for (const user of party) {
    renderRow(user, 'player');
    renderRow(user, 'character');
  }
  for (const cards of [participantCards, characterCards]) {
    for (const [key, card] of cards) {
      if (!party.some((u) => u.key === key)) {
        card.remove();
        cards.delete(key);
      }
    }
  }

  refreshStatusBar();
}

// The last Tavern sync result, in the same words the old per-tab note used.
function tavernSyncMessage(t) {
  const sync = t && t.sync;
  if (!(t && t.state === 'connected' && sync && sync.at)) return '';
  const bits = [];
  if (sync.created.length) bits.push(`created ${sync.created.join(', ')}`);
  if (sync.updated.length) bits.push(`updated ${sync.updated.join(', ')}`);
  if (sync.renamed.length) bits.push(`renamed ${sync.renamed.join(', ')}`);
  if (sync.hidden && sync.hidden.length) bits.push(`hid ${sync.hidden.join('; ')}`);
  if (sync.missing.length) bits.push(`waiting for OBS: ${sync.missing.join(', ')}`);
  return sync.note || (bits.length ? `Last sync: ${bits.join('; ')}.` : 'Last sync: everything already in place.');
}

// One status line for the whole app: the save state normally, or -- while
// looking at the Tavern tab and nothing is being saved right now -- the
// last sync result instead, so there is a single place to check rather
// than a second note living inside the Tavern card.
function refreshStatusBar() {
  if (isDirty()) return;
  const msg = activeTab === 'tavern' ? tavernSyncMessage(status.tavern) : '';
  setSaveState(msg || 'All changes saved');
}

function isPublished(entry) {
  return Boolean(entry && (entry.source || entry.characterSource));
}

// Show/Add creates the source the first time and shows it every time after;
// Hide turns it off without deleting it -- Delete from OBS is the only
// thing that does.
async function onTavernRowClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = event.currentTarget;
  const key = card.dataset.key;
  const k = TAVERN_KINDS[card.dataset.kind];
  try {
    if (button.dataset.action === 'toggle') {
      const entry = config.tavern.players[key];
      const ticked = Boolean(entry && entry[k.field]);
      const next = await api.tavernSetChoice(key, k.field, !ticked);
      config.tavern.players[key] = next;
      renderTavern();
    } else if (button.dataset.action === 'remove-source') {
      const entry = config.tavern.players[key];
      const name = entry && entry[k.sourceField];
      if (name && window.confirm(`Delete "${name}" from OBS?`)) await api.obsRemoveSource(name);
    } else if (button.dataset.action === 'copy-link') {
      const url = await api.tavernViewUrl(key, k.viewKind);
      await navigator.clipboard.writeText(url);
      setSaveState('View link copied');
    }
  } catch (err) {
    reportError(err);
  }
}

// ---------------------------------------------------------------------------
// Automations (Foundry modules, e.g. Herald, -> Studio -> OBS)
// ---------------------------------------------------------------------------

const automationsEls = {
  enabled: $('automations-enabled'),
  tag: $('automations-tag'),
  dot: $('automations-dot'),
  tab: $('automations-tab'),
  settings: $('automations-settings'),
  port: $('automations-port'),
  token: $('automations-token'),
  generateToken: $('automations-generate-token'),
  copyToken: $('automations-copy-token'),
  addresses: $('automations-addresses'),
  status: $('automations-status'),
  scenes: $('automations-scenes'),
  refreshScenes: $('automations-refresh-scenes'),
  startRecording: $('automations-start-recording'),
  pauseRecording: $('automations-pause-recording'),
  resumeRecording: $('automations-resume-recording'),
  stopRecording: $('automations-stop-recording'),
  recordingTag: $('automations-recording-tag'),
  pausedTag: $('automations-paused-tag'),
  startStreaming: $('automations-start-streaming'),
  stopStreaming: $('automations-stop-streaming'),
  streamingTag: $('automations-streaming-tag'),
  obsStatus: $('automations-obs-status'),
  studioActions: $('automations-studio-actions'),
  rulesets: $('automations-rulesets'),
  rulesetsEmpty: $('automations-rulesets-empty'),
  addRuleset: $('automations-add-ruleset'),
  testEvent: $('automations-test-event'),
  sendTest: $('automations-send-test'),
};

// What each OBS action means, what kind of thing its `param` holds
// ('scene'/'source' get a live picker, 'none' hides the field), and which
// menu group it belongs in -- kept in sync by hand with
// AUTOMATIONS_ACTION_SCHEMA in src/config.js, the same way TAVERN_KINDS
// above is a renderer-side copy of server-side knowledge.
const AUTOMATION_ACTIONS = [
  { value: 'sceneSwitch', label: 'Switch scene to', paramType: 'scene', group: 'Scenes' },
  { value: 'sourceShow', label: 'Show source', paramType: 'source', group: 'Sources' },
  { value: 'sourceHide', label: 'Hide source', paramType: 'source', group: 'Sources' },
  { value: 'sourceToggle', label: 'Toggle source', paramType: 'source', group: 'Sources' },
  { value: 'setText', label: 'Set text on source', paramType: 'source', group: 'Sources' },
  { value: 'startRecording', label: 'Start recording', paramType: 'none', group: 'Controls' },
  { value: 'pauseRecording', label: 'Pause recording', paramType: 'none', group: 'Controls' },
  { value: 'resumeRecording', label: 'Resume recording', paramType: 'none', group: 'Controls' },
  { value: 'stopRecording', label: 'Stop recording', paramType: 'none', group: 'Controls' },
  { value: 'startStreaming', label: 'Start streaming', paramType: 'none', group: 'Controls' },
  { value: 'stopStreaming', label: 'Stop streaming', paramType: 'none', group: 'Controls' },
];
// Studio actions: same shape, kept in sync by hand with STUDIO_ACTION_SCHEMA
// in src/config.js. Whether one shows up as a choice anywhere is decided by
// config.automations.studioActions (the checkboxes below), not this list.
const STUDIO_ACTIONS = [
  { value: 'wakeAudio', label: 'Wake audio (every open window)', paramType: 'none', group: 'Studio Control' },
  { value: 'startAll', label: 'Start all windows', paramType: 'none', group: 'Studio Control' },
  { value: 'stopAll', label: 'Stop all windows', paramType: 'none', group: 'Studio Control' },
  { value: 'dockAll', label: 'Dock all windows', paramType: 'none', group: 'Studio Control' },
  { value: 'undockAll', label: 'Undock all windows', paramType: 'none', group: 'Studio Control' },
  { value: 'syncObs', label: 'Sync OBS', paramType: 'none', group: 'Studio Control' },
  { value: 'incrementEpisode', label: 'Increment episode number', paramType: 'none', group: 'Studio Control' },
  { value: 'applyEpisodeText', label: 'Write season/episode to a text source', paramType: 'source', group: 'Studio Control' },
  { value: 'applySessionFilename', label: 'Apply the session filename format to OBS', paramType: 'none', group: 'Studio Control' },
];

// Live OBS scene/source names, refreshed by refreshAutomationsScenes() below
// -- used by the OBS Control card's scene buttons and by every rule set
// step's scene/source picker.
let automationsScenes = [];
let automationsSources = [];
// Tracks the OBS state as of the last status push, so refreshAutomationsScenes()
// can be triggered automatically the moment OBS actually connects (api.onStatus,
// below) rather than only on tab-open or a manual Refresh click -- otherwise a
// step's scene/source picker stays empty until the user notices and refreshes
// it themselves.
let automationsObsWasConnected = false;

// OBS actions, plus whichever Studio actions are currently ticked on.
function availableActions() {
  const enabled = new Set(config.automations.studioActions || []);
  return [...AUTOMATION_ACTIONS, ...STUDIO_ACTIONS.filter((a) => enabled.has(a.value))];
}

function applyAutomationsConfig(firstLoad) {
  const a = config.automations;
  automationsEls.enabled.checked = a.enabled;
  automationsEls.settings.hidden = !a.enabled;
  automationsEls.tab.hidden = !a.enabled;
  if (!a.enabled && activeTab === 'automations') selectTab('session');
  if (document.activeElement !== automationsEls.port) automationsEls.port.value = String(a.port);
  if (document.activeElement !== automationsEls.token) automationsEls.token.value = a.token;
  // Every status push -- including the one an OBS action like "Time it"
  // triggers almost immediately by changing the scene -- calls this via
  // applyConfig. A rebuild here from that stale snapshot would wipe
  // anything local and not yet saved: a step added but not yet touched
  // (add-step/add-delay only render locally, matching the rest of the
  // app's add-then-save-on-first-edit pattern), a "Time it" run in
  // progress, mid-typing in a name/event field. isEditing() alone isn't
  // enough to guard that -- a clicked button doesn't reliably keep focus
  // on every platform -- so past the very first load, this list is only
  // ever driven by the user's own local actions (add/remove/move/save all
  // already re-render themselves); a passive push no longer touches it.
  if (firstLoad) {
    renderAutomationsStudioActions();
    renderAutomationsRuleSets();
  }
}

async function saveAutomationsSettings(patch) {
  await flushSave();
  const next = patch || {
    enabled: automationsEls.enabled.checked,
    port: Number(automationsEls.port.value) || 9500,
    token: automationsEls.token.value,
  };
  config.automations = { ...config.automations, ...next };
  try {
    status.automations = await api.automationsSetSettings(next);
  } catch (err) {
    reportError(err);
  }
  applyAutomationsConfig();
  renderAutomationsStatus();
  renderConnectionsBoard();
}
for (const el of [automationsEls.enabled, automationsEls.port, automationsEls.token]) {
  el.addEventListener('change', () => saveAutomationsSettings());
}
automationsEls.generateToken.addEventListener('click', () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  automationsEls.token.value = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  saveAutomationsSettings();
});
automationsEls.copyToken.addEventListener('click', async () => {
  if (!automationsEls.token.value) return;
  await navigator.clipboard.writeText(automationsEls.token.value);
  setSaveState('Token copied');
});

// A small "copy" icon button, matching the one used for a Tavern view link.
function copyButton(value, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-small btn-icon';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 1 1 4.2 4.2l-1.7 1.7a1 1 0 1 1-1.4-1.4l1.7-1.7a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0zm2.8-2.8a1 1 0 0 1 0 1.4L10 15.4a3 3 0 1 1-4.2-4.2l1.7-1.7a1 1 0 1 1 1.4 1.4l-1.7 1.7a1 1 0 0 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 0z"/></svg>';
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(value);
    setSaveState('Address copied');
  });
  return btn;
}

// The server's own live state (listening/port/addresses/events) -- distinct
// from config.automations above (the settings that drive it).
function renderAutomationsStatus() {
  const a = status.automations || { state: 'stopped', message: '', port: 0, addresses: [], events: [] };
  const listening = a.state === 'listening';
  automationsEls.tag.hidden = !listening;
  automationsEls.dot.classList.toggle('on', listening);
  automationsEls.addresses.textContent = '';
  // One row per network interface this Mac has right now -- which one is
  // actually reachable from the Foundry machine depends on the network, so
  // rather than guess, every candidate gets shown with its own copy button.
  const candidates = listening ? a.addresses : [];
  if (!candidates.length) {
    const row = document.createElement('div');
    row.className = 'details-row';
    const key = document.createElement('span');
    key.className = 'details-key';
    key.textContent = 'Address';
    const value = document.createElement('span');
    value.className = 'details-value';
    value.textContent = '—';
    row.append(key, value);
    automationsEls.addresses.appendChild(row);
  } else {
    for (const ip of candidates) {
      const url = `https://${ip}:${a.port}`;
      const row = document.createElement('div');
      row.className = 'details-row';
      const key = document.createElement('span');
      key.className = 'details-key';
      key.textContent = 'Address';
      const value = document.createElement('span');
      value.className = 'details-value';
      value.textContent = url;
      row.append(key, value, copyButton(url, `Copy ${url}`));
      automationsEls.addresses.appendChild(row);

      // The CA cert install link, one per address for the same reason the
      // address itself gets one per interface -- whichever address is
      // actually reachable from the Foundry machine is also the one whose
      // /ca.crt link will resolve there.
      const caUrl = `${url}/ca.crt`;
      const caRow = document.createElement('div');
      caRow.className = 'details-row';
      const caKey = document.createElement('span');
      caKey.className = 'details-key';
      caKey.textContent = 'CA cert';
      const caValue = document.createElement('span');
      caValue.className = 'details-value hint';
      caValue.textContent = caUrl;
      caRow.append(caKey, caValue, copyButton(caUrl, `Copy ${caUrl}`));
      automationsEls.addresses.appendChild(caRow);
    }
  }
  const labels = { stopped: 'Not enabled.', listening: a.message, error: a.message || 'Could not start.' };
  automationsEls.status.textContent = labels[a.state] || '';
  automationsEls.status.classList.toggle('hint-error', a.state === 'error');
}

// Recording/streaming/paused state and which scene button is current, from
// the regular OBS status push -- refreshAutomationsScenes() below is the
// only thing that re-reads the scene/source *lists* themselves, since that
// needs an actual round trip to OBS rather than something already on the
// status broadcast.
function renderAutomationsObs() {
  const o = status.obs || { state: 'disconnected' };
  const outputs = o.outputs || { recording: false, recordingPaused: false, streaming: false, scene: '' };
  const connected = o.state === 'connected';
  automationsEls.recordingTag.hidden = !outputs.recording;
  automationsEls.pausedTag.hidden = !outputs.recordingPaused;
  automationsEls.streamingTag.hidden = !outputs.streaming;
  automationsEls.obsStatus.textContent = connected ? '' : 'OBS is not connected.';
  automationsEls.startRecording.disabled = !connected || outputs.recording;
  automationsEls.pauseRecording.hidden = outputs.recordingPaused;
  automationsEls.resumeRecording.hidden = !outputs.recordingPaused;
  automationsEls.pauseRecording.disabled = !connected || !outputs.recording;
  automationsEls.resumeRecording.disabled = !connected;
  automationsEls.stopRecording.disabled = !connected || !outputs.recording;
  automationsEls.startStreaming.disabled = !connected;
  automationsEls.stopStreaming.disabled = !connected;
  for (const btn of automationsEls.scenes.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.scene === outputs.scene);
  }
}

// Re-reads the scene and source lists from OBS -- unlike everything else in
// this section, this needs an actual round trip, so it only happens when
// the tab is opened or the user asks, not on every status push.
async function refreshAutomationsScenes() {
  if (!status.obs || status.obs.state !== 'connected') {
    automationsScenes = [];
    automationsSources = [];
  } else {
    try {
      const [scenes, sources] = await Promise.all([api.obsListScenes(), api.obsListSources()]);
      automationsScenes = scenes;
      automationsSources = sources;
    } catch (err) {
      reportError(err);
    }
  }
  renderAutomationsSceneButtons();
  renderAutomationsRuleSets();
}

function renderAutomationsSceneButtons() {
  automationsEls.scenes.textContent = '';
  const outputs = (status.obs && status.obs.outputs) || {};
  for (const s of automationsScenes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small';
    btn.textContent = s.name;
    btn.dataset.scene = s.name;
    if (s.name === outputs.scene) btn.classList.add('active');
    btn.addEventListener('click', () => api.obsSetScene(s.name).catch(reportError));
    automationsEls.scenes.appendChild(btn);
  }
}
automationsEls.refreshScenes.addEventListener('click', () => refreshAutomationsScenes());
automationsEls.startRecording.addEventListener('click', () => api.obsStartRecording().catch(reportError));
automationsEls.pauseRecording.addEventListener('click', () => api.obsPauseRecording().catch(reportError));
automationsEls.resumeRecording.addEventListener('click', () => api.obsResumeRecording().catch(reportError));
automationsEls.stopRecording.addEventListener('click', () => api.obsStopRecording().catch(reportError));
automationsEls.startStreaming.addEventListener('click', () => api.obsStartStreaming().catch(reportError));
automationsEls.stopStreaming.addEventListener('click', () => api.obsStopStreaming().catch(reportError));

// --- Studio Control: which Studio actions (beyond OBS's own) are exposed,
// off by default -- see the note by STUDIO_ACTIONS above. ---
function renderAutomationsStudioActions() {
  automationsEls.studioActions.textContent = '';
  const enabled = new Set(config.automations.studioActions || []);
  for (const a of STUDIO_ACTIONS) {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = enabled.has(a.value);
    input.dataset.studioAction = a.value;
    const span = document.createElement('span');
    span.textContent = a.label;
    label.append(input, span);
    automationsEls.studioActions.appendChild(label);
  }
}

async function saveAutomationsStudioActions() {
  try {
    status.automations = await api.automationsSetSettings({ studioActions: config.automations.studioActions });
  } catch (err) {
    reportError(err);
  }
  renderAutomationsStudioActions();
  renderAutomationsRuleSets(); // a step's available actions may have changed
}

automationsEls.studioActions.addEventListener('change', (event) => {
  const value = event.target.dataset.studioAction;
  if (!value) return;
  const current = new Set(config.automations.studioActions || []);
  if (event.target.checked) current.add(value);
  else current.delete(value);
  config.automations.studioActions = STUDIO_ACTIONS.map((a) => a.value).filter((v) => current.has(v));
  saveAutomationsStudioActions();
});

// --- Rule sets: each one its own card (mirrors the Regions pattern), a
// name/group/trigger-event header and a numbered sequence of steps. Live in
// config.automations.ruleSets; edited directly in the DOM and saved as a
// whole array on every change, same shape sent to automations:setSettings.
// ---
const rulesetTemplate = $('ruleset-template');

function ruleSetFromCard(card) {
  return (config.automations.ruleSets || []).find((r) => r.id === card.dataset.rulesetId);
}

// One display number per step: increments at the start of each stage (a
// plain step, or any delay), so `and`-joined action steps share their
// stage's number. Mirrors stagesFor() in src/main.js exactly, so what's
// numbered here is what actually runs together.
function stageNumbers(steps) {
  const numbers = [];
  let n = 0;
  let prevWasAction = false;
  steps.forEach((step, i) => {
    const newStage = i === 0 || step.type === 'delay' || !step.and || !prevWasAction;
    if (newStage) n += 1;
    numbers.push(n);
    prevWasAction = step.type === 'action';
  });
  return numbers;
}

function optionsForParamType(paramType) {
  if (paramType === 'scene') return automationsScenes.map((s) => s.name);
  if (paramType === 'source') return automationsSources;
  return [];
}

// Which tint a step's box gets: one per action group (Scenes its own,
// Sources+Controls share "obs" since both are plain OBS remote actions,
// Studio Control its own), plus "timer" for a delay -- lets a whole rule
// set's sequence be scanned by colour rather than read word by word.
function tintClassFor(step, actions) {
  if (step.type === 'delay') return 'automation-step-tint-timer';
  const meta = actions.find((a) => a.value === step.action);
  if (meta && meta.group === 'Scenes') return 'automation-step-tint-scenes';
  if (meta && meta.group === 'Studio Control') return 'automation-step-tint-studio';
  return 'automation-step-tint-obs';
}

// Kept in lockstep with RESERVED_FIELD_KEYS in src/config.js -- small and
// static enough to just duplicate rather than round-trip through IPC for
// something that never changes at runtime.
const RESERVED_FIELD_KEYS = ['sessionTime', 'sessionDate', 'sessionDay', 'sessionMonth', 'sessionYear', 'sessionSeasonNumber', 'sessionEpisodeNumber'];

// Every option a setText step's "Data Field" picker offers, grouped for the
// <optgroup> markup below -- Studio's own built-ins (always present, no
// setup needed), then Metadata (config.metadataFields, a "+1"/"-1" pair
// added for every Number-typed one -- see resolveDataField in main.js for
// what selecting one of those actually does), then whatever each connected
// module has registered via POST /api/automations/fields, one group per
// module so two modules' fields never look like one undifferentiated list.
function dataFieldGroups() {
  const groups = [];
  const withKeys = (pairs) => pairs.map(([key, label]) => ({ key, label: `${label} (${key})` }));

  groups.push({
    label: 'Date & Time',
    fields: withKeys([
      ['sessionTime', 'Current time'],
      ['sessionDate', 'Current date'],
      ['sessionDay', 'Day of week'],
      ['sessionMonth', 'Month'],
      ['sessionYear', 'Year'],
    ]),
  });
  groups.push({
    label: 'Season & Episode',
    fields: withKeys([
      ['sessionSeasonNumber', 'Season number'],
      ['sessionSeasonNumber+1', 'Season number + 1'],
      ['sessionSeasonNumber-1', 'Season number - 1'],
      ['sessionEpisodeNumber', 'Episode number'],
      ['sessionEpisodeNumber+1', 'Episode number + 1'],
      ['sessionEpisodeNumber-1', 'Episode number - 1'],
    ]),
  });

  const metadataFields = (config && config.metadataFields) || [];
  if (metadataFields.length) {
    const fields = [];
    for (const f of metadataFields) {
      fields.push({ key: f.key, label: `${f.label} (${f.key})` });
      if (f.type === 'number') {
        fields.push({ key: `${f.key}+1`, label: `${f.label} + 1 (${f.key}+1)` });
        fields.push({ key: `${f.key}-1`, label: `${f.label} - 1 (${f.key}-1)` });
      }
    }
    groups.push({ label: 'Metadata', fields });
  }

  const registered = (status.automations && status.automations.registeredFields) || [];
  const byModule = new Map();
  for (const f of registered) {
    const source = f.source || 'module';
    if (!byModule.has(source)) byModule.set(source, []);
    byModule.get(source).push({ key: f.key, label: `${f.label} (${f.key})` });
  }
  for (const [source, fields] of byModule) groups.push({ label: `From ${source}`, fields });

  return groups;
}

function buildStepRow(step, index, number, isFirst, timeableActions) {
  const row = document.createElement('div');
  row.className = `automation-step ${tintClassFor(step, availableActions())}`;
  row.dataset.stepId = step.id;

  const numberEl = document.createElement('span');
  numberEl.className = 'automation-step-number';
  numberEl.textContent = String(number);
  row.appendChild(numberEl);

  if (step.type === 'delay') {
    row.classList.add('automation-step-delay');
    const before = document.createElement('span');
    before.className = 'automation-step-label';
    before.textContent = 'Wait';
    const seconds = document.createElement('input');
    seconds.type = 'number';
    seconds.min = '1';
    seconds.max = '3600';
    seconds.step = '1';
    seconds.className = 'automation-step-seconds';
    seconds.value = step.seconds;
    seconds.dataset.sfield = 'seconds';
    const after = document.createElement('span');
    after.className = 'automation-step-label';
    after.textContent = 'seconds';
    row.append(before, seconds, after);

    // "Time it": run the step(s) right before this delay, start a stopwatch,
    // and let the delay measure itself instead of being guessed at -- only
    // offered when there is actually something valid to run (not the first
    // step, and not right after another delay). `timing` lives in this
    // click handler's own closure, so it needs no cross-row bookkeeping;
    // if the row is torn down by an unrelated re-render mid-timing, the
    // interval just keeps ticking harmlessly against a detached button.
    if (timeableActions && timeableActions.length) {
      const timeBtn = document.createElement('button');
      timeBtn.type = 'button';
      timeBtn.className = 'btn btn-small automation-step-time-btn';
      timeBtn.innerHTML = '<i class="fa-solid fa-stopwatch" aria-hidden="true"></i> Time it';
      let timing = null;
      timeBtn.addEventListener('click', async () => {
        if (timing) {
          clearInterval(timing.intervalId);
          const elapsed = Math.max(1, Math.round((Date.now() - timing.startedAt) / 1000));
          seconds.value = elapsed;
          seconds.disabled = false;
          step.seconds = elapsed;
          timing = null;
          timeBtn.classList.remove('btn-primary');
          timeBtn.innerHTML = '<i class="fa-solid fa-stopwatch" aria-hidden="true"></i> Time it';
          saveAutomationsRuleSets();
          return;
        }
        try {
          // The whole step, not just {action, param} -- a setText step needs
          // its valueType/value/filePath/dataField to resolve to anything at
          // all (see resolveTextValue in main.js); sending only action/param
          // used to make a timed "File" or "Data Field" step write blank
          // text every time, since there was nothing left to read from.
          await api.automationsRunSteps(timeableActions.map((s) => ({ ...s })));
        } catch (err) {
          reportError(err);
          return;
        }
        timing = { startedAt: Date.now() };
        seconds.disabled = true;
        timeBtn.classList.add('btn-primary');
        // Marked dirty for the whole run: a status push landing mid-timing
        // (the scene switch just above triggers one almost immediately)
        // must not swap out the local config out from under this -- see the
        // note on applyAutomationsConfig.
        setSaveState('Timing a step...', 'dirty');
        const tick = () => {
          const elapsed = Math.round((Date.now() - timing.startedAt) / 1000);
          timeBtn.innerHTML = `<i class="fa-solid fa-stop" aria-hidden="true"></i> Stop timer (${elapsed}s)`;
        };
        tick();
        timing.intervalId = setInterval(tick, 1000);
      });
      row.appendChild(timeBtn);
    }
  } else {
    const andLabel = document.createElement('label');
    andLabel.className = 'check automation-step-and';
    andLabel.title = 'Run together with the step before this one, instead of waiting for it';
    const andInput = document.createElement('input');
    andInput.type = 'checkbox';
    andInput.checked = Boolean(step.and);
    andInput.dataset.sfield = 'and';
    andInput.disabled = isFirst;
    const andSpan = document.createElement('span');
    andSpan.textContent = 'AND';
    andLabel.append(andInput, andSpan);
    row.appendChild(andLabel);

    const actions = availableActions();
    const actionSelect = document.createElement('select');
    actionSelect.dataset.sfield = 'action';
    const groups = new Map();
    for (const a of actions) {
      if (!groups.has(a.group)) {
        const group = document.createElement('optgroup');
        group.label = a.group;
        groups.set(a.group, group);
      }
      const opt = document.createElement('option');
      opt.value = a.value;
      opt.textContent = a.label;
      if (a.value === step.action) opt.selected = true;
      groups.get(a.group).appendChild(opt);
    }
    for (const group of groups.values()) actionSelect.appendChild(group);
    row.appendChild(actionSelect);

    const meta = actions.find((a) => a.value === step.action) || actions[0];
    if (meta && meta.paramType !== 'none') {
      const options = optionsForParamType(meta.paramType);
      const paramSelect = document.createElement('select');
      paramSelect.dataset.sfield = 'param';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = options.length ? `Choose a ${meta.paramType}…` : `No ${meta.paramType}s loaded — click Refresh above`;
      paramSelect.appendChild(blank);
      for (const name of options) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === step.param) opt.selected = true;
        paramSelect.appendChild(opt);
      }
      // The saved value might not be in the live list (OBS not connected,
      // or the scene/source was since renamed or removed) -- keep it
      // selectable rather than silently discarding it on the next save.
      // The warning goes at the FRONT of the label, not the end: a closed
      // <select> only ever shows the start of its selected option's text,
      // so an "(not currently in OBS)" suffix was invisible until the user
      // actually opened the dropdown.
      if (step.param && !options.includes(step.param)) {
        const opt = document.createElement('option');
        opt.value = step.param;
        opt.textContent = `[!] ${step.param} — not in OBS`;
        opt.style.color = 'var(--danger)';
        opt.selected = true;
        paramSelect.appendChild(opt);
        paramSelect.classList.add('automation-step-param-missing');
      }
      row.appendChild(paramSelect);
    }

    // setText's value is one of three explicit kinds -- "where it goes" is
    // param above, this picks "what it is": a fixed preset typed once
    // (no external caller involved at all), a local file Studio re-reads
    // every run, or a field a connected module has actually registered
    // (never a name typed blind against an undocumented contract).
    if (step.action === 'setText') {
      const valueTypeSelect = document.createElement('select');
      valueTypeSelect.className = 'automation-step-valuetype';
      valueTypeSelect.dataset.sfield = 'valueType';
      for (const [v, label] of [['literal', 'Free Text'], ['file', 'File'], ['dataField', 'Data Field']]) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = label;
        if ((step.valueType || 'literal') === v) opt.selected = true;
        valueTypeSelect.appendChild(opt);
      }
      row.appendChild(valueTypeSelect);

      const valueType = step.valueType || 'literal';
      if (valueType === 'literal') {
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'automation-step-value';
        valueInput.placeholder = 'Text to set';
        valueInput.value = step.value || '';
        valueInput.dataset.sfield = 'value';
        row.appendChild(valueInput);
      } else if (valueType === 'file') {
        const fileInput = document.createElement('input');
        fileInput.type = 'text';
        fileInput.className = 'automation-step-filepath';
        fileInput.spellcheck = false;
        fileInput.placeholder = '/path/to/file.txt';
        fileInput.value = step.filePath || '';
        fileInput.dataset.sfield = 'filePath';
        row.appendChild(fileInput);

        const browseBtn = document.createElement('button');
        browseBtn.type = 'button';
        browseBtn.className = 'btn btn-small';
        browseBtn.textContent = 'Browse';
        browseBtn.addEventListener('click', async () => {
          const picked = await api.automationsPickTextFile();
          if (!picked) return;
          fileInput.value = picked;
          step.filePath = picked;
          saveAutomationsRuleSets();
        });
        row.appendChild(browseBtn);
      } else {
        const fieldSelect = document.createElement('select');
        fieldSelect.dataset.sfield = 'dataField';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Choose a field…';
        fieldSelect.appendChild(blank);
        const groups = dataFieldGroups();
        const allKeys = new Set();
        for (const group of groups) {
          if (!group.fields.length) continue;
          const optgroup = document.createElement('optgroup');
          optgroup.label = group.label;
          for (const f of group.fields) {
            allKeys.add(f.key);
            const opt = document.createElement('option');
            opt.value = f.key;
            opt.textContent = f.label;
            if (f.key === step.dataField) opt.selected = true;
            optgroup.appendChild(opt);
          }
          fieldSelect.appendChild(optgroup);
        }
        // The saved key might not exist any more (a metadata field or a
        // module's registration was deleted/changed) -- keep it selectable
        // rather than silently discarding it, same reasoning as the
        // scene/source pickers above.
        if (step.dataField && !allKeys.has(step.dataField)) {
          const opt = document.createElement('option');
          opt.value = step.dataField;
          opt.textContent = `[!] ${step.dataField} — not registered`;
          opt.style.color = 'var(--danger)';
          opt.selected = true;
          fieldSelect.appendChild(opt);
          fieldSelect.classList.add('automation-step-param-missing');
        }
        row.appendChild(fieldSelect);
      }
    }
  }

  const moveUp = document.createElement('button');
  moveUp.type = 'button';
  moveUp.className = 'btn btn-small btn-icon';
  moveUp.title = 'Move up';
  moveUp.setAttribute('aria-label', 'Move up');
  moveUp.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
  moveUp.dataset.saction = 'move-up';
  moveUp.disabled = index === 0;

  const moveDown = document.createElement('button');
  moveDown.type = 'button';
  moveDown.className = 'btn btn-small btn-icon';
  moveDown.title = 'Move down';
  moveDown.setAttribute('aria-label', 'Move down');
  moveDown.innerHTML = '<i class="fa-solid fa-arrow-down" aria-hidden="true"></i>';
  moveDown.dataset.saction = 'move-down';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-small btn-icon btn-danger';
  remove.title = 'Remove step';
  remove.setAttribute('aria-label', 'Remove step');
  remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  remove.dataset.saction = 'remove';

  // Right-aligned cluster for move/remove, so they always sit at the
  // trailing edge, not just wherever they land after variable-width
  // content earlier in the row. Time it stays with the seconds field
  // instead of here -- it's part of setting the delay, not a row action.
  const actionsEl = document.createElement('div');
  actionsEl.className = 'automation-step-actions';
  actionsEl.append(moveUp, moveDown, remove);
  row.appendChild(actionsEl);
  return row;
}

function renderRulesetSteps(card, ruleSet) {
  const container = card.querySelector('[data-role="steps"]');
  container.textContent = '';
  const numbers = stageNumbers(ruleSet.steps);
  ruleSet.steps.forEach((step, i) => {
    // "Time it" only makes sense on a delay with a real action stage right
    // before it -- not the first step, and not right after another delay
    // (that stage's steps are all type 'delay', so this comes back empty).
    let timeableActions = null;
    if (step.type === 'delay') {
      const prevStage = numbers[i] - 1;
      const actions = ruleSet.steps.filter((s, j) => numbers[j] === prevStage && s.type === 'action');
      if (actions.length) timeableActions = actions;
    }
    const row = buildStepRow(step, i, numbers[i], i === 0, timeableActions);
    if (i === ruleSet.steps.length - 1) row.querySelector('[data-saction="move-down"]').disabled = true;
    container.appendChild(row);
  });
}

function buildRulesetCard(ruleSet) {
  const node = rulesetTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.rulesetId = ruleSet.id;
  node.classList.toggle('disabled', !ruleSet.enabled);
  node.querySelector('[data-rsfield="enabled"]').checked = ruleSet.enabled;
  node.querySelector('[data-rsfield="name"]').value = ruleSet.name;
  node.querySelector('[data-rsfield="group"]').value = ruleSet.group;
  node.querySelector('[data-rsfield="event"]').value = ruleSet.event;
  renderRulesetSteps(node, ruleSet);
  return node;
}

function renderAutomationsRuleSets() {
  const ruleSets = config.automations.ruleSets || [];
  automationsEls.rulesets.textContent = '';
  automationsEls.rulesetsEmpty.hidden = ruleSets.length > 0;
  for (const ruleSet of ruleSets) automationsEls.rulesets.appendChild(buildRulesetCard(ruleSet));
}

async function saveAutomationsRuleSets() {
  try {
    status.automations = await api.automationsSetSettings({ ruleSets: config.automations.ruleSets });
    setSaveState('All changes saved');
  } catch (err) {
    reportError(err);
  }
  renderAutomationsRuleSets();
}

automationsEls.rulesets.addEventListener('change', (event) => {
  const card = event.target.closest('.ruleset-card');
  if (!card) return;
  const ruleSet = ruleSetFromCard(card);
  if (!ruleSet) return;

  const rsfield = event.target.dataset.rsfield;
  if (rsfield) {
    ruleSet[rsfield] = rsfield === 'enabled' ? event.target.checked : event.target.value;
    saveAutomationsRuleSets();
    return;
  }

  const stepRow = event.target.closest('.automation-step');
  const sfield = event.target.dataset.sfield;
  if (!stepRow || !sfield) return;
  const step = ruleSet.steps.find((s) => s.id === stepRow.dataset.stepId);
  if (!step) return;
  if (sfield === 'and') step.and = event.target.checked;
  else if (sfield === 'seconds') step.seconds = Number(event.target.value) || 1;
  else step[sfield] = event.target.value;
  if (sfield === 'action') step.param = ''; // the param field's kind depends on the action
  saveAutomationsRuleSets();
});

automationsEls.rulesets.addEventListener('click', async (event) => {
  const card = event.target.closest('.ruleset-card');
  if (!card) return;
  const ruleSet = ruleSetFromCard(card);
  if (!ruleSet) return;
  // .closest(), not event.target.dataset directly -- these buttons hold an
  // <i> icon, so a click can land on the icon rather than the button itself.
  const actionBtn = event.target.closest('[data-action]');
  const action = actionBtn && actionBtn.dataset.action;

  if (action === 'delete-ruleset') {
    config.automations.ruleSets = config.automations.ruleSets.filter((r) => r.id !== ruleSet.id);
    saveAutomationsRuleSets();
    return;
  }
  if (action === 'save-ruleset') {
    saveAutomationsRuleSets();
    return;
  }
  if (action === 'test-ruleset') {
    if (!ruleSet.event) {
      reportError(new Error('Set this rule set\'s event before testing it.'));
      return;
    }
    // Only a "Data Field" setText step genuinely needs external test data
    // -- "Free Text" and "File" are self-contained and already run
    // correctly with none. Testing with no data at all for a Data Field
    // step (what this used to always send, unconditionally) means it
    // reads nothing and writes blank text no matter what it's configured
    // with. Ask for real data, pre-filled with every such step's own
    // dataField as an empty skeleton, so there's something to actually
    // fill in rather than silently testing blank.
    let data = {};
    const fields = [
      ...new Set(
        ruleSet.steps
          .filter((s) => s.type === 'action' && s.action === 'setText' && s.valueType === 'dataField')
          .map((s) => s.dataField || 'text')
      ),
    ];
    if (fields.length) {
      const skeleton = {};
      for (const f of fields) skeleton[f] = '';
      const input = window.prompt(
        'This rule set has a step reading a Data Field. Enter test data as JSON:',
        JSON.stringify(skeleton)
      );
      if (input === null) return; // cancelled
      try {
        data = JSON.parse(input);
      } catch (err) {
        reportError(new Error('That was not valid JSON -- test cancelled.'));
        return;
      }
    }
    try {
      status.automations = await api.automationsTestEvent(ruleSet.event, data);
      renderAutomationsStatus();
      setSaveState(`Test event "${ruleSet.event}" sent`);
    } catch (err) {
      reportError(err);
    }
    return;
  }
  if (action === 'add-step') {
    ruleSet.steps.push({ id: `step${Date.now().toString(36)}`, type: 'action', action: availableActions()[0].value, param: '', and: false });
    renderRulesetSteps(card, ruleSet);
    setSaveState('Unsaved changes...', 'dirty'); // not yet sent -- see saveAutomationsRuleSets
    return;
  }
  if (action === 'add-delay') {
    ruleSet.steps.push({ id: `step${Date.now().toString(36)}`, type: 'delay', seconds: 5, and: false });
    renderRulesetSteps(card, ruleSet);
    setSaveState('Unsaved changes...', 'dirty');
    return;
  }

  const stepRow = event.target.closest('.automation-step');
  const sactionBtn = event.target.closest('[data-saction]');
  const saction = sactionBtn && sactionBtn.dataset.saction;
  if (!stepRow || !saction) return;
  const index = ruleSet.steps.findIndex((s) => s.id === stepRow.dataset.stepId);
  if (index === -1) return;
  if (saction === 'move-up' && index > 0) {
    [ruleSet.steps[index - 1], ruleSet.steps[index]] = [ruleSet.steps[index], ruleSet.steps[index - 1]];
  } else if (saction === 'move-down' && index < ruleSet.steps.length - 1) {
    [ruleSet.steps[index], ruleSet.steps[index + 1]] = [ruleSet.steps[index + 1], ruleSet.steps[index]];
  } else if (saction === 'remove') {
    ruleSet.steps.splice(index, 1);
  } else {
    return;
  }
  if (ruleSet.steps[0]) ruleSet.steps[0].and = false;
  saveAutomationsRuleSets();
});

automationsEls.addRuleset.addEventListener('click', () => {
  const id = `ruleset${Date.now().toString(36)}`;
  config.automations.ruleSets = [
    ...(config.automations.ruleSets || []),
    { id, name: '', group: '', enabled: true, event: '', steps: [] },
  ];
  renderAutomationsRuleSets();
  setSaveState('Unsaved changes...', 'dirty');
});

automationsEls.sendTest.addEventListener('click', async () => {
  const name = automationsEls.testEvent.value.trim();
  if (!name) return;
  try {
    status.automations = await api.automationsTestEvent(name, {});
    renderAutomationsStatus();
  } catch (err) {
    reportError(err);
  }
});

// ---------------------------------------------------------------------------
// Region picker
// ---------------------------------------------------------------------------

const picker = {
  el: $('picker'),
  title: $('picker-title'),
  nameEl: $('picker-region-name'),
  img: $('picker-img'),
  wrap: $('snapshot-wrap'),
  sel: $('picker-sel'),
  x: $('region-x'),
  y: $('region-y'),
  w: $('region-w'),
  h: $('region-h'),
  statusEl: $('picker-status'),
  viewId: null,
  region: null,
  size: { width: 1, height: 1 },
  drag: null,
};

function pickerRect() {
  return {
    x: Math.max(0, Math.round(Number(picker.x.value) || 0)),
    y: Math.max(0, Math.round(Number(picker.y.value) || 0)),
    width: Math.max(1, Math.round(Number(picker.w.value) || 1)),
    height: Math.max(1, Math.round(Number(picker.h.value) || 1)),
  };
}

function setPickerRect(rect) {
  picker.x.value = String(rect.x);
  picker.y.value = String(rect.y);
  picker.w.value = String(rect.width);
  picker.h.value = String(rect.height);
  drawSelection();
}

function pointsToPx() {
  return picker.img.clientWidth / picker.size.width;
}

function drawSelection() {
  const k = pointsToPx();
  const r = pickerRect();
  if (!k || !Number.isFinite(k)) return;
  picker.sel.hidden = false;
  picker.sel.style.left = `${r.x * k}px`;
  picker.sel.style.top = `${r.y * k}px`;
  picker.sel.style.width = `${r.width * k}px`;
  picker.sel.style.height = `${r.height * k}px`;
}

async function loadSnapshot() {
  picker.statusEl.textContent = 'Taking snapshot...';
  try {
    const snap = await api.snapshotView(picker.viewId);
    picker.size = { width: snap.width, height: snap.height };
    await new Promise((resolve) => {
      picker.img.onload = resolve;
      picker.img.onerror = resolve;
      picker.img.src = snap.dataUrl;
    });
    picker.statusEl.textContent = `Page is ${snap.width} × ${snap.height}.`;
  } catch (err) {
    picker.statusEl.textContent = String(err.message).replace(/^.*Error: /, '');
  }
  drawSelection();
}

// Open the snapshot picker for an existing region; saving updates its rectangle.
async function openPicker(viewId, region) {
  if (!region) return;
  const view = config.views.find((v) => v.id === viewId);
  picker.viewId = viewId;
  picker.region = region;
  picker.title.textContent = `Draw "${region.name}" on ${view.label}`;
  picker.nameEl.textContent =
    region.mode === 'selector'
      ? 'This region follows a CSS selector; the rectangle you pick here is replaced on the next sync unless you switch it to Rectangle.'
      : 'Drag a box on the snapshot or adjust the numbers, then save.';
  picker.sel.hidden = true;
  picker.img.removeAttribute('src');
  picker.el.hidden = false;
  await loadSnapshot();
  setPickerRect(region);
}

function closePicker() {
  picker.el.hidden = true;
  picker.viewId = null;
  picker.region = null;
  picker.drag = null;
}

$('picker-close').addEventListener('click', closePicker);
picker.el.addEventListener('click', (event) => {
  if (event.target === picker.el) closePicker();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !picker.el.hidden) closePicker();
});
$('picker-refresh').addEventListener('click', loadSnapshot);
for (const input of [picker.x, picker.y, picker.w, picker.h]) input.addEventListener('input', drawSelection);
window.addEventListener('resize', () => {
  if (!picker.el.hidden) drawSelection();
});

function snapshotPoint(event) {
  const bounds = picker.img.getBoundingClientRect();
  const k = pointsToPx();
  const x = Math.min(picker.size.width, Math.max(0, (event.clientX - bounds.left) / k));
  const y = Math.min(picker.size.height, Math.max(0, (event.clientY - bounds.top) / k));
  return { x: Math.round(x), y: Math.round(y) };
}
picker.wrap.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !picker.img.clientWidth) return;
  picker.drag = snapshotPoint(event);
  event.preventDefault();
});
window.addEventListener('mousemove', (event) => {
  if (!picker.drag) return;
  const p = snapshotPoint(event);
  const x = Math.min(picker.drag.x, p.x);
  const y = Math.min(picker.drag.y, p.y);
  setPickerRect({ x, y, width: Math.max(1, Math.abs(p.x - picker.drag.x)), height: Math.max(1, Math.abs(p.y - picker.drag.y)) });
});
window.addEventListener('mouseup', () => {
  picker.drag = null;
});

$('picker-save').addEventListener('click', async () => {
  if (!picker.region) return;
  const view = config.views.find((v) => v.id === picker.viewId);
  const current = view ? view.regions.find((r) => r.id === picker.region.id) : null;
  const region = { ...(current || picker.region), ...pickerRect() };
  try {
    await api.saveRegion(picker.viewId, region);
    closePicker();
  } catch (err) {
    picker.statusEl.textContent = String(err.message).replace(/^.*Error: /, '');
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function init() {
  const [cfg, st, info] = await Promise.all([api.getConfig(), api.getStatus(), api.getAppInfo()]);
  if (info.limits) limits = info.limits;
  status = st;
  activeTab = recallTab();
  applyConfig(cfg);
  renderDisplays();
  renderObs();
  renderStatus();
  renderConnectionsBoard();
  $('app-info').textContent =
    `${info.revision}${info.build && info.build.branch ? ` on ${info.build.branch}` : ''} - Electron ${info.electron} - Chromium ${info.chrome}`;
  document.title = `Coffee Pub Studio - Control Panel - ${info.revision}`;
})().catch((err) => setSaveState(`Failed to start: ${err.message}`, 'error'));
