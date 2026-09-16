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
  applyTavernConfig();
  applyAutomationsConfig();
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
for (const el of [menuBarIconEl, hideDockIconEl, retinaDoubleEl, dockEnabledEl, dockSideEl, dockOverlapEl, wakeDelayEl]) el.addEventListener('change', scheduleSave);
wakeDelayEl.addEventListener('input', () => {
  wakeDelayValueEl.textContent = describeDelay(Number(wakeDelayEl.value));
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
  scene: $('automations-scene'),
  switchScene: $('automations-switch-scene'),
  refreshScenes: $('automations-refresh-scenes'),
  startRecording: $('automations-start-recording'),
  stopRecording: $('automations-stop-recording'),
  recordingTag: $('automations-recording-tag'),
  startStreaming: $('automations-start-streaming'),
  stopStreaming: $('automations-stop-streaming'),
  streamingTag: $('automations-streaming-tag'),
  obsStatus: $('automations-obs-status'),
  rules: $('automations-rules'),
  rulesEmpty: $('automations-rules-empty'),
  addRule: $('automations-add-rule'),
  testEvent: $('automations-test-event'),
  sendTest: $('automations-send-test'),
  events: $('automations-events'),
  eventsEmpty: $('automations-events-empty'),
};

// What each action means and what its `param` field is for -- kept in sync
// by hand with AUTOMATIONS_ACTIONS in src/config.js, the same way
// TAVERN_KINDS above is a renderer-side copy of server-side knowledge.
const AUTOMATION_ACTIONS = [
  { value: 'sceneSwitch', label: 'Switch scene to', param: 'scene name' },
  { value: 'sourceShow', label: 'Show source', param: 'source name' },
  { value: 'sourceHide', label: 'Hide source', param: 'source name' },
  { value: 'startRecording', label: 'Start recording', param: null },
  { value: 'stopRecording', label: 'Stop recording', param: null },
  { value: 'startStreaming', label: 'Start streaming', param: null },
  { value: 'stopStreaming', label: 'Stop streaming', param: null },
];

function applyAutomationsConfig() {
  const a = config.automations;
  automationsEls.enabled.checked = a.enabled;
  automationsEls.settings.hidden = !a.enabled;
  automationsEls.tab.hidden = !a.enabled;
  if (!a.enabled && activeTab === 'automations') selectTab('session');
  if (document.activeElement !== automationsEls.port) automationsEls.port.value = String(a.port);
  if (document.activeElement !== automationsEls.token) automationsEls.token.value = a.token;
  renderAutomationsRules();
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
  renderAutomationsEvents(a.events || []);
}

function renderAutomationsEvents(events) {
  automationsEls.events.textContent = '';
  automationsEls.eventsEmpty.hidden = events.length > 0;
  for (const e of events.slice(0, 20)) {
    const row = document.createElement('div');
    row.className = 'automations-event-row';
    const time = document.createElement('span');
    time.className = 'automations-event-time';
    time.textContent = new Date(e.at).toLocaleTimeString();
    const name = document.createElement('span');
    name.className = 'automations-event-name';
    name.textContent = e.event;
    const data = document.createElement('span');
    data.className = 'automations-event-data hint';
    data.textContent = e.data && Object.keys(e.data).length ? JSON.stringify(e.data) : '';
    row.append(time, name, data);
    automationsEls.events.appendChild(row);
  }
}

// Recording/streaming state and the scene <select>'s current pick, from the
// regular OBS status push -- refreshAutomationsScenes() below is the only
// thing that re-reads the scene *list* itself, since that needs an actual
// round trip to OBS rather than something already on the status broadcast.
function renderAutomationsObs() {
  const o = status.obs || { state: 'disconnected' };
  const outputs = o.outputs || { recording: false, streaming: false, scene: '' };
  const connected = o.state === 'connected';
  automationsEls.recordingTag.hidden = !outputs.recording;
  automationsEls.streamingTag.hidden = !outputs.streaming;
  automationsEls.obsStatus.textContent = connected ? '' : 'OBS is not connected.';
  automationsEls.switchScene.disabled = !connected;
  automationsEls.startRecording.disabled = !connected;
  automationsEls.stopRecording.disabled = !connected;
  automationsEls.startStreaming.disabled = !connected;
  automationsEls.stopStreaming.disabled = !connected;
  if (outputs.scene && document.activeElement !== automationsEls.scene) {
    for (const opt of automationsEls.scene.options) opt.selected = opt.value === outputs.scene;
  }
}

// Rules live in config.automations.rules; edited directly in the DOM and
// saved as a whole array on every change (blur/select), same shape as a
// real rule sent to automations:setSettings.
function ruleFromRow(row) {
  return (config.automations.rules || []).find((r) => r.id === row.dataset.ruleId);
}

function buildRuleRow(rule) {
  const row = document.createElement('div');
  row.className = 'row automations-rule-row';
  row.dataset.ruleId = rule.id;

  const eventField = document.createElement('label');
  eventField.className = 'field field-inline';
  const eventLabel = document.createElement('span');
  eventLabel.textContent = 'Event';
  const eventInput = document.createElement('input');
  eventInput.type = 'text';
  eventInput.size = 16;
  eventInput.spellcheck = false;
  eventInput.placeholder = 'combat:start';
  eventInput.value = rule.event;
  eventInput.dataset.rfield = 'event';
  eventField.append(eventLabel, eventInput);

  const actionField = document.createElement('label');
  actionField.className = 'field field-inline';
  const actionLabel = document.createElement('span');
  actionLabel.textContent = 'Action';
  const actionSelect = document.createElement('select');
  actionSelect.dataset.rfield = 'action';
  for (const a of AUTOMATION_ACTIONS) {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    if (a.value === rule.action) opt.selected = true;
    actionSelect.appendChild(opt);
  }
  actionField.append(actionLabel, actionSelect);

  const meta = AUTOMATION_ACTIONS.find((a) => a.value === rule.action);
  const paramField = document.createElement('label');
  paramField.className = 'field field-inline';
  const paramLabel = document.createElement('span');
  paramLabel.textContent = meta && meta.param ? meta.param.replace(/^./, (c) => c.toUpperCase()) : 'Param';
  const paramInput = document.createElement('input');
  paramInput.type = 'text';
  paramInput.size = 20;
  paramInput.spellcheck = false;
  paramInput.value = rule.param;
  paramInput.dataset.rfield = 'param';
  paramInput.disabled = !meta || !meta.param;
  paramInput.placeholder = meta && meta.param ? `e.g. ${meta.param}` : 'not used by this action';
  paramField.append(paramLabel, paramInput);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-danger';
  removeBtn.textContent = 'Remove';
  removeBtn.dataset.raction = 'remove';

  row.append(eventField, actionField, paramField, removeBtn);
  return row;
}

function renderAutomationsRules() {
  const rules = config.automations.rules || [];
  automationsEls.rules.textContent = '';
  automationsEls.rulesEmpty.hidden = rules.length > 0;
  for (const rule of rules) automationsEls.rules.appendChild(buildRuleRow(rule));
}

async function saveAutomationsRules() {
  try {
    await api.automationsSetSettings({ rules: config.automations.rules });
  } catch (err) {
    reportError(err);
  }
  renderAutomationsRules();
}

automationsEls.rules.addEventListener('change', (event) => {
  const row = event.target.closest('.automations-rule-row');
  const field = event.target.dataset.rfield;
  if (!row || !field) return;
  const rule = ruleFromRow(row);
  if (!rule) return;
  rule[field] = event.target.value;
  saveAutomationsRules();
});
automationsEls.rules.addEventListener('click', (event) => {
  if (event.target.dataset.raction !== 'remove') return;
  const row = event.target.closest('.automations-rule-row');
  if (!row) return;
  config.automations.rules = config.automations.rules.filter((r) => r.id !== row.dataset.ruleId);
  saveAutomationsRules();
});
automationsEls.addRule.addEventListener('click', () => {
  const id = `rule${Date.now().toString(36)}`;
  config.automations.rules = [...(config.automations.rules || []), { id, event: '', action: AUTOMATION_ACTIONS[0].value, param: '' }];
  renderAutomationsRules();
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

// Re-reads the scene list from OBS -- unlike everything else in this
// section, this needs an actual round trip, so it only happens when the
// tab is opened or the user asks, not on every status push.
async function refreshAutomationsScenes() {
  if (!status.obs || status.obs.state !== 'connected') {
    automationsEls.scene.textContent = '';
    return;
  }
  try {
    const scenes = await api.obsListScenes();
    automationsEls.scene.textContent = '';
    for (const s of scenes) {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      if (s.current) opt.selected = true;
      automationsEls.scene.appendChild(opt);
    }
  } catch (err) {
    reportError(err);
  }
}
automationsEls.refreshScenes.addEventListener('click', () => refreshAutomationsScenes());
automationsEls.switchScene.addEventListener('click', async () => {
  const name = automationsEls.scene.value;
  if (!name) return;
  try {
    await api.obsSetScene(name);
  } catch (err) {
    reportError(err);
  }
});
automationsEls.startRecording.addEventListener('click', () => api.obsStartRecording().catch(reportError));
automationsEls.stopRecording.addEventListener('click', () => api.obsStopRecording().catch(reportError));
automationsEls.startStreaming.addEventListener('click', () => api.obsStartStreaming().catch(reportError));
automationsEls.stopStreaming.addEventListener('click', () => api.obsStopStreaming().catch(reportError));

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
  $('app-info').textContent =
    `${info.revision}${info.build && info.build.branch ? ` on ${info.build.branch}` : ''} - Electron ${info.electron} - Chromium ${info.chrome}`;
  document.title = `Coffee Pub Studio - Control Panel - ${info.revision}`;
})().catch((err) => setSaveState(`Failed to start: ${err.message}`, 'error'));
