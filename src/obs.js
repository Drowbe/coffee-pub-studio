'use strict';

// Bridge to OBS Studio over its built-in WebSocket server (obs-websocket v5,
// OBS 28+). Keeps OBS "macOS Screen Capture" inputs pointed at this app's
// windows, whose system window IDs change on every launch.

const EventEmitter = require('events');
// JSON encoding: human-readable on the wire and easy to test; OBS speaks both.
const { OBSWebSocket } = require('obs-websocket-js/json');

const INPUT_KIND = 'screen_capture'; // macOS Screen Capture (ScreenCaptureKit)
const CAPTURE_TYPE_WINDOW = 1; // settings.type: 0 display, 1 window, 2 application
const WINDOWS_INPUT_KIND = 'window_capture'; // Windows "Window Capture"
// window_capture's "priority" setting: 0 match class, 1 title must match,
// 2 title else same executable. Every Studio window shares one executable and
// one window class, so anything but "title must match" could quietly capture
// a different Studio window while the intended one is closed.
const WINDOWS_PRIORITY_TITLE = 1;
const PROBE_INPUT_NAME = 'Coffee Pub Probe';

// What differs between OBS on macOS and OBS on Windows when capturing a
// window. Everything else Studio does to a source -- crop filters, scaling,
// muting, visibility -- is the same on both. A window is a number on macOS
// (the system window ID) and a "Title:Class:Executable" string on Windows;
// in both cases OBS lists the choices itself, and Studio uses the value OBS
// returns rather than building one.
const MAC_BACKEND = {
  name: 'macos',
  kind: INPUT_KIND,
  label: 'macOS Screen Capture',
  // The window a listed input points at, or null when it is not a window capture.
  readInput(settings) {
    const type = settings.type === undefined ? CAPTURE_TYPE_WINDOW : settings.type;
    if (type !== CAPTURE_TYPE_WINDOW) return null;
    return { window: settings.window || 0, showCursor: Boolean(settings.show_cursor) };
  },
  pointSettings: (window) => ({ type: CAPTURE_TYPE_WINDOW, window }),
  clearSettings: () => ({ type: CAPTURE_TYPE_WINDOW, window: 0 }),
  createSettings: (window, showCursor) => ({ type: CAPTURE_TYPE_WINDOW, window, show_cursor: showCursor }),
  cursorSettings: (showCursor) => ({ show_cursor: showCursor }),
  restartButton: 'reactivate_capture',
};

const WINDOWS_BACKEND = {
  name: 'windows',
  kind: WINDOWS_INPUT_KIND,
  label: 'Windows Window Capture',
  readInput(settings) {
    return {
      window: typeof settings.window === 'string' ? settings.window : '',
      showCursor: settings.cursor === undefined ? true : Boolean(settings.cursor),
    };
  },
  pointSettings: (window) => ({ window, priority: WINDOWS_PRIORITY_TITLE }),
  clearSettings: () => ({ window: '' }),
  createSettings: (window, showCursor) => ({ window, priority: WINDOWS_PRIORITY_TITLE, cursor: showCursor }),
  cursorSettings: (showCursor) => ({ cursor: showCursor }),
  restartButton: null,
};

// A window value OBS can have returned: a system window ID (macOS) or a
// Title:Class:Executable string (Windows).
function isWindowValue(value) {
  return Number.isInteger(value) || (typeof value === 'string' && value.length > 0);
}
const BROWSER_KIND = 'browser_source';
const CROP_FILTER_KIND = 'crop_filter'; // OBS "Crop/Pad"
const CROP_FILTER_NAME = 'Coffee Pub Crop';
// Formerly an OBS "Color Correction" filter used to dim/tint offline and
// aside sources. Pulled out entirely: applied to these (alpha-transparent)
// Tavern browser sources, it corrupted the rendered image into static-like
// colour noise even at neutral (opacity 1.0, no tint) settings -- confirmed
// live, deleting the filter was what fixed it, not adjusting its settings.
// The name is kept only so removeDimFilter can clean up leftovers from
// before this was reverted.
const DIM_FILTER_NAME = 'Coffee Pub Dim';
const RECONNECT_MS = 10000;

// OBS lists each capturable window as "[App Name] Window Title" on macOS and
// "[app.exe]: Window Title" on Windows. Split it into the two halves; if a
// future OBS formats it differently, the whole string lands in `title` and
// matching still works, since it's a substring test against the full label
// either way.
function parseWindowChoice(itemName) {
  const m = /^\[(.+?)\]:?\s*(.*)$/.exec(String(itemName || ''));
  return m ? { app: m[1], title: m[2] } : { app: '', title: String(itemName || '') };
}

// The window ID of the first listed window whose label contains both the
// saved app name and the saved title (each optional, case-insensitive).
// Both empty matches nothing rather than "the first window" -- a match
// rule that says nothing shouldn't quietly capture something arbitrary.
// Which listed window a match rule points at, ranked so the pick is the one
// the user actually chose, not merely the first of the app's windows: the
// exact label they picked, if that window is still listed; otherwise the
// first substring match that HAS a title (an app's hidden/helper windows
// are usually untitled -- capturing one of those is a source that shows
// nothing); otherwise the first substring match at all.
function findAppWindowChoice(choices, match) {
  const app = String(match.app || '').toLowerCase();
  const title = String(match.title || '').toLowerCase();
  const usable = (c) => typeof c.itemName === 'string' && isWindowValue(c.itemValue);
  if (match.label) {
    const exact = choices.find((c) => usable(c) && c.itemName === match.label);
    if (exact) return exact;
  }
  if (!app && !title) return null;
  const hits = choices.filter((c) => {
    if (!usable(c)) return false;
    const hay = c.itemName.toLowerCase();
    return (!app || hay.includes(app)) && (!title || hay.includes(title));
  });
  return hits.find((c) => parseWindowChoice(c.itemName).title.trim()) || hits[0] || null;
}

function findAppWindow(choices, match) {
  const hit = findAppWindowChoice(choices, match);
  return hit ? hit.itemValue : null;
}

class ObsBridge extends EventEmitter {
  /**
   * @param {object} options
   * @param {() => {autoConnect: boolean, host: string, port: number}} options.getSettings
   * @param {() => string} options.getPassword
   */
  constructor({ getSettings, getPassword }) {
    super();
    this.getSettings = getSettings;
    this.getPassword = getPassword;
    this.obs = new OBSWebSocket();
    this.state = 'disconnected';
    this.message = '';
    this.suspended = false; // user pressed Disconnect: no auto-reconnect until Connect
    this.obsVersion = '';
    this.platform = ''; // what OBS reports running on (GetVersion's platform)
    this.backend = MAC_BACKEND; // chosen from the platform on connect
    this.inputs = []; // window-capture inputs known in OBS: [{ name, window }]
    this.reconnectTimer = null;
    this.connecting = null;
    this.outputs = { recording: false, recordingPaused: false, recordTime: '', streaming: false, streamTime: '', scene: '' };
    this.lastRecordingPath = ''; // the most recent recording's file -- what uploadToYouTube defaults to; src/main.js restores it across restarts
    this.pollTimer = null;

    this.obs.on('ConnectionClosed', (err) => {
      this.stopPolling();
      if (this.suspended) return; // our own disconnect() already reported it
      const wasConnected = this.state === 'connected';
      this.inputs = [];
      this.setState('disconnected', wasConnected ? 'Connection to OBS closed.' : (err && err.message) || '');
      this.scheduleReconnect();
    });
    // A recording that ends any way at all -- Studio's own stop action, the
    // OBS Stop button, a hotkey -- reports the file it wrote here, so the
    // last recording is known even when Studio did not stop it itself.
    this.obs.on('RecordStateChanged', (event) => {
      if (event && event.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED' && event.outputPath) {
        this.lastRecordingPath = event.outputPath;
        this.emit('recording', event.outputPath);
      }
    });
    this.obs.on('InputCreated', () => this.refreshInputs().catch(() => {}));
    this.obs.on('InputRemoved', () => this.refreshInputs().catch(() => {}));
    this.obs.on('InputNameChanged', () => this.refreshInputs().catch(() => {}));
  }

  status() {
    return {
      state: this.state,
      message: this.message,
      obsVersion: this.obsVersion,
      inputs: this.inputs.map((i) => i.name),
      outputs: this.outputs,
    };
  }

  // Record/stream state and current scene, refreshed every couple of seconds
  // while connected (shown in the dock).
  async pollOutputs() {
    if (!this.connected) return;
    try {
      const [rec, stream, scene] = await Promise.all([
        this.obs.call('GetRecordStatus'),
        this.obs.call('GetStreamStatus'),
        this.obs.call('GetCurrentProgramScene'),
      ]);
      const next = {
        recording: Boolean(rec.outputActive),
        recordingPaused: Boolean(rec.outputPaused),
        recordTime: rec.outputActive ? String(rec.outputTimecode || '').replace(/\.\d+$/, '') : '',
        streaming: Boolean(stream.outputActive),
        streamTime: stream.outputActive ? String(stream.outputTimecode || '').replace(/\.\d+$/, '') : '',
        scene: scene.currentProgramSceneName || '',
      };
      if (JSON.stringify(next) !== JSON.stringify(this.outputs)) {
        this.outputs = next;
        this.emit('status', this.status());
      }
    } catch (err) {
      // Older OBS versions may lack one of these; ignore.
    }
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollOutputs(), 2000);
    this.pollOutputs();
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.outputs = { recording: false, recordingPaused: false, recordTime: '', streaming: false, streamTime: '', scene: '' };
  }

  setState(state, message = '') {
    this.state = state;
    this.message = message;
    this.emit('status', this.status());
  }

  get connected() {
    return this.state === 'connected';
  }

  // At launch: connect only when auto-connect is on.
  async start() {
    clearTimeout(this.reconnectTimer);
    if (!this.getSettings().autoConnect) return;
    await this.connect().catch(() => {});
  }

  async stop() {
    clearTimeout(this.reconnectTimer);
    await this.obs.disconnect().catch(() => {});
  }

  // User-initiated disconnect: pauses auto-reconnect until the next connect().
  async disconnect() {
    clearTimeout(this.reconnectTimer);
    this.stopPolling();
    this.suspended = true;
    this.inputs = [];
    if (this.connected) {
      await this.obs.disconnect().catch(() => {});
    }
    this.setState('disconnected', 'Disconnected.');
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (!this.getSettings().autoConnect || this.suspended) return;
    this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), RECONNECT_MS);
  }

  async connect() {
    if (this.connecting) return this.connecting;
    this.suspended = false;
    const { host, port } = this.getSettings();
    this.setState('connecting', `Connecting to ${host}:${port}...`);
    this.connecting = (async () => {
      try {
        const password = this.getPassword();
        const hello = await this.obs.connect(`ws://${host}:${port}`, password || undefined, { rpcVersion: 1 });
        this.obsVersion = hello.obsWebSocketVersion || '';
        const version = await this.obs.call('GetVersion');
        this.obsVersion = version.obsVersion || this.obsVersion;
        this.platform = String(version.platform || '');
        // The window-capture input kind follows the machine OBS runs on; an
        // unknown platform keeps the macOS behavior this has always had.
        this.backend = /windows/i.test(this.platform) ? WINDOWS_BACKEND : MAC_BACKEND;
        await this.refreshInputs();
        this.setState('connected', `Connected to OBS ${this.obsVersion}.`);
        this.startPolling();
        this.emit('connected');
      } catch (err) {
        const text = describeError(err);
        this.setState('error', text);
        this.scheduleReconnect();
        throw new Error(text);
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  // All window-capture inputs (macOS Screen Capture in window mode, or
  // Windows Window Capture), with the window each one currently points at.
  async refreshInputs() {
    if (!this.connected && this.state !== 'connecting') return [];
    const { inputs } = await this.obs.call('GetInputList', { inputKind: this.backend.kind });
    const result = [];
    for (const input of inputs) {
      if (input.inputName === PROBE_INPUT_NAME) continue;
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: input.inputName });
      const read = this.backend.readInput(inputSettings);
      if (!read) continue;
      result.push({ name: input.inputName, ...read });
    }
    this.inputs = result;
    this.emit('status', this.status());
    return result;
  }

  // Runs `fn(inputName)` against an input of the window-capture kind to read
  // properties from -- OBS only exposes its window list through an existing
  // input. Uses a real one if there is one. Otherwise, on Windows only and
  // only when asked to, a hidden temporary input is created and removed
  // again (macOS has always required a source to exist first, and that is
  // left as it was).
  async withProbe(fn, { create = false } = {}) {
    const existing = this.inputs[0];
    if (existing) return fn(existing.name);
    if (!create || this.backend.name !== 'windows') return null;
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    await this.obs.call('CreateInput', {
      sceneName: currentProgramSceneName,
      inputName: PROBE_INPUT_NAME,
      inputKind: this.backend.kind,
      inputSettings: {},
      sceneItemEnabled: false,
    });
    try {
      return await fn(PROBE_INPUT_NAME);
    } finally {
      await this.obs.call('RemoveInput', { inputName: PROBE_INPUT_NAME }).catch(() => {});
    }
  }

  // OBS's own list of capturable windows: [{ itemName, itemValue }].
  async windowChoices({ createProbe = false } = {}) {
    const items = await this.withProbe(async (inputName) => {
      const { propertyItems } = await this.obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName: 'window' });
      return propertyItems || [];
    }, { create: createProbe });
    return items || [];
  }

  // The current window ID of whichever open window matches, or null --
  // the same lookup a sync does, exposed for creating an app window's source.
  async findAppWindowId(match) {
    return findAppWindow(await this.windowChoices({ createProbe: true }).catch(() => []), match);
  }

  async pointInput(inputName, windowId) {
    await this.obs.call('SetInputSettings', {
      inputName,
      inputSettings: this.backend.pointSettings(windowId),
      overlay: true,
    });
  }

  // Make OBS start the capture again, as the "Restart capture" button in the
  // source's properties does. A capture that began while the window was not
  // yet on screen never produces frames until this happens.
  async restartCapture(inputName, windowId) {
    if (this.backend.restartButton) {
      try {
        await this.obs.call('PressInputPropertiesButton', { inputName, propertyName: this.backend.restartButton });
        return 'button';
      } catch (err) {
        // fall through to the reset below
      }
    }
    // Clearing and re-setting the window forces a new capture.
    await this.obs.call('SetInputSettings', { inputName, inputSettings: this.backend.clearSettings(), overlay: true });
    await this.pointInput(inputName, windowId);
    return 'reset';
  }

  // Create or update the crop filter on a region's input. Crop values are in
  // captured pixels: { left, top, right, bottom }.
  async ensureCropFilter(inputName, crop) {
    const filterSettings = { left: crop.left, top: crop.top, right: crop.right, bottom: crop.bottom, relative: true };
    let exists = false;
    try {
      await this.obs.call('GetSourceFilter', { sourceName: inputName, filterName: CROP_FILTER_NAME });
      exists = true;
    } catch (err) {
      exists = false;
    }
    if (exists) {
      await this.obs.call('SetSourceFilterSettings', { sourceName: inputName, filterName: CROP_FILTER_NAME, filterSettings, overlay: true });
    } else {
      await this.obs.call('CreateSourceFilter', { sourceName: inputName, filterName: CROP_FILTER_NAME, filterKind: CROP_FILTER_KIND, filterSettings });
    }
  }

  async removeCropFilter(inputName) {
    await this.obs.call('RemoveSourceFilter', { sourceName: inputName, filterName: CROP_FILTER_NAME }).catch(() => {});
  }

  async removeInput(inputName) {
    await this.obs.call('RemoveInput', { inputName });
    await this.refreshInputs();
  }

  // Best-effort cleanup of a "Coffee Pub Dim" filter left over from before
  // OBS-side dimming was reverted (see the constant's comment above). A
  // no-op once a source has none.
  async removeDimFilter(inputName) {
    await this.obs.call('RemoveSourceFilter', { sourceName: inputName, filterName: DIM_FILTER_NAME }).catch(() => {});
  }

  async setInputMuted(inputName, muted) {
    await this.obs.call('SetInputMute', { inputName, inputMuted: muted });
  }

  // Show or hide every scene item that references a source, in top-level
  // scenes and inside groups. Returns how many items were changed.
  async setSourceVisible(sourceName, visible) {
    const { scenes } = await this.obs.call('GetSceneList');
    let changed = 0;
    const apply = async (sceneName, items) => {
      for (const item of items) {
        if (item.sourceName === sourceName) {
          await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: visible });
          changed += 1;
        }
        if (item.isGroup) {
          const { sceneItems } = await this.obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
          await apply(item.sourceName, sceneItems);
        }
      }
    };
    for (const scene of scenes) {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: scene.sceneName });
      await apply(scene.sceneName, sceneItems);
    }
    return changed;
  }

  // Flip a source's visibility to whatever it currently is not, so a single
  // event can toggle a source instead of needing a separate show and hide
  // event. Reads the first scene item's current state and applies its
  // opposite everywhere via setSourceVisible above; a source with no scene
  // item anywhere is treated as hidden, so toggling it shows it.
  async toggleSourceVisible(sourceName) {
    const { scenes } = await this.obs.call('GetSceneList');
    let current = null;
    const find = async (sceneName, items) => {
      for (const item of items) {
        if (current !== null) return;
        if (item.sourceName === sourceName) {
          current = item.sceneItemEnabled;
          return;
        }
        if (item.isGroup) {
          const { sceneItems } = await this.obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
          await find(item.sourceName, sceneItems);
        }
      }
    };
    for (const scene of scenes) {
      if (current !== null) break;
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: scene.sceneName });
      await find(scene.sceneName, sceneItems);
    }
    return this.setSourceVisible(sourceName, current !== true);
  }

  // Scale every scene item of a source to `scale` (the Retina correction),
  // but only items still at 1 or at an old correction, so a transform the
  // user set by hand in OBS is left alone.
  async ensureScale(sourceName, scale) {
    const ours = (v) => [1, 0.5, 1 / 3, scale].some((s) => Math.abs(v - s) < 0.001);
    const { scenes } = await this.obs.call('GetSceneList');
    const apply = async (sceneName, items) => {
      for (const item of items) {
        if (item.sourceName === sourceName) {
          const { sceneItemTransform: t } = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: item.sceneItemId });
          const current = t && typeof t.scaleX === 'number' ? t.scaleX : 1;
          if (Math.abs(current - scale) < 0.001 || !ours(current)) continue;
          await this.obs.call('SetSceneItemTransform', { sceneName, sceneItemId: item.sceneItemId, sceneItemTransform: { scaleX: scale, scaleY: scale } });
        }
        if (item.isGroup) {
          const { sceneItems } = await this.obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
          await apply(item.sourceName, sceneItems);
        }
      }
    };
    for (const scene of scenes) {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: scene.sceneName });
      await apply(scene.sceneName, sceneItems);
    }
  }

  // What OBS actually reports about window capture on this machine, for
  // checking the Windows backend (and anything else) against the real thing:
  // the platform, which capture kinds exist, every existing capture input's
  // full settings, OBS's own window list, and the "priority" options.
  async captureReport() {
    if (!this.connected) throw new Error('Connect to OBS first.');
    const report = { platform: this.platform, backend: this.backend.name, kind: this.backend.kind, obsVersion: this.obsVersion };
    const kinds = await this.obs.call('GetInputKindList', { unversioned: false }).catch(() => ({ inputKinds: [] }));
    report.captureKinds = (kinds.inputKinds || []).filter((k) => /capture|window|screen/i.test(k));
    report.inputs = [];
    const { inputs } = await this.obs.call('GetInputList', { inputKind: this.backend.kind }).catch(() => ({ inputs: [] }));
    for (const input of inputs) {
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: input.inputName }).catch(() => ({ inputSettings: null }));
      report.inputs.push({ name: input.inputName, settings: inputSettings });
    }
    const probed = await this.withProbe(
      async (inputName) => {
        const list = async (propertyName) => {
          try {
            const { propertyItems } = await this.obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName });
            return propertyItems || [];
          } catch (err) {
            return { error: err.message };
          }
        };
        return { windows: await list('window'), priority: await list('priority'), method: await list('method') };
      },
      { create: true }
    );
    report.windows = probed ? probed.windows : 'no window-capture input exists and one could not be created';
    report.priorityOptions = probed ? probed.priority : null;
    report.methodOptions = probed ? probed.method : null;
    return report;
  }

  // Every input's name, of any kind -- unlike status().inputs (screen_capture
  // only, for the window/region tracking above) or browserInputs() (browser
  // sources only), this is for a plain "does this name exist at all" check
  // before deleting something whose kind the caller doesn't know or care
  // about.
  async allInputNames() {
    if (!this.connected) return new Set();
    const { inputs } = await this.obs.call('GetInputList');
    return new Set(inputs.map((i) => i.inputName));
  }

  // --- Browser sources (Coffee Pub Tavern players) --------------------------

  // Every Browser Source in OBS with its URL and size.
  async browserInputs() {
    if (!this.connected) return [];
    const { inputs } = await this.obs.call('GetInputList', { inputKind: BROWSER_KIND });
    const result = [];
    for (const input of inputs) {
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: input.inputName });
      result.push({
        name: input.inputName,
        url: inputSettings.url || '',
        width: inputSettings.width,
        height: inputSettings.height,
        rerouteAudio: Boolean(inputSettings.reroute_audio),
      });
    }
    return result;
  }

  async createBrowserInput(inputName, { url, width, height, audio }) {
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    await this.obs.call('CreateInput', {
      sceneName: currentProgramSceneName,
      inputName,
      inputKind: BROWSER_KIND,
      inputSettings: { url, width, height, shutdown: false, restart_when_active: false, reroute_audio: Boolean(audio) },
      sceneItemEnabled: true,
    });
    return inputName;
  }

  async setBrowserInput(inputName, { url, width, height, audio }) {
    await this.obs.call('SetInputSettings', {
      inputName,
      inputSettings: { url, width, height, reroute_audio: Boolean(audio) },
      overlay: true,
    });
  }

  async renameInput(inputName, newInputName) {
    await this.obs.call('SetInputName', { inputName, newInputName });
  }

  async createInput(inputName, windowId, { showCursor = false } = {}) {
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    await this.obs.call('CreateInput', {
      sceneName: currentProgramSceneName,
      inputName,
      inputKind: this.backend.kind,
      inputSettings: this.backend.createSettings(windowId, showCursor),
      sceneItemEnabled: true,
    });
    await this.refreshInputs();
    return inputName;
  }

  /**
   * Point every linked OBS input at the current window ID of its app window
   * and detect inputs that already point at one of our windows.
   *
   * `force` lists view ids whose windows just appeared: their sources are
   * re-pointed and their captures restarted even when the ID is unchanged.
   *
   * @param {Array<{id: string, title: string, windowId: number|null, sources: string[], allRegionSources?: string[],
   *   crop: object|null,
   *   regions: Array<{name: string, obsSource: string, crop: {left: number, top: number, right: number, bottom: number}}>}>} views
   * @returns {Promise<{pointed: string[], cropped: string[], missing: string[], detected: Array<{id: string, input: string}>}>}
   */
  async syncViews(views, force = new Set()) {
    if (!this.connected) throw new Error('Not connected to OBS.');
    await this.refreshInputs();
    const choices = await this.windowChoices().catch(() => []);
    const known = new Set(this.inputs.map((i) => i.name));
    const report = { pointed: [], cropped: [], missing: [], detected: [], restarted: [], resolved: {}, matchedLabels: {} };
    // Every name some window or region already owns; those are never "detected".
    const owned = new Set(views.flatMap((v) => [...v.sources, ...(v.allRegionSources || v.regions.map((r) => r.obsSource))]));

    // Prefer the window ID OBS itself reports for our title; fall back to
    // the ID Electron knows.
    const resolveId = (view) => {
      // An app window (some other application's) has no title of ours to
      // look for -- it's found by its saved match rule instead. No fallback
      // ID exists for it, so an unmatched one is simply "not open right now".
      if (view.match) {
        const chosen = findAppWindowChoice(choices, view.match);
        report.matchedLabels[view.id] = chosen ? chosen.itemName : null;
        return chosen ? chosen.itemValue : null;
      }
      const match = choices.find((c) => typeof c.itemName === 'string' && c.itemName.endsWith(view.title));
      if (match && isWindowValue(match.itemValue)) return match.itemValue;
      return view.windowId;
    };

    for (const view of views) {
      const windowId = resolveId(view);
      report.resolved[view.id] = windowId || null;
      // Detect unowned inputs already pointing at this window. Not for an
      // app window: adoption exists to link a hand-made source to one of
      // OUR windows, and an app window's source name is set by the user.
      for (const input of view.match ? [] : this.inputs) {
        if (windowId && input.window === windowId && !owned.has(input.name)) {
          report.detected.push({ id: view.id, input: input.name });
        }
      }
      const regionSources = view.regions.filter((r) => r.obsSource).map((r) => r.obsSource);
      for (const name of [...view.sources, ...regionSources]) {
        if (!known.has(name)) {
          report.missing.push(name);
          continue;
        }
        // macOS window/region capture taps the window's own system audio
        // independently of anything Electron does with its webContents mute
        // -- confirmed live, muting the page did not stop this input from
        // carrying audio. Keep OBS's own per-input mute in lockstep with the
        // window's "Mute audio" setting instead of leaving it at whatever
        // OBS's own default is. Applied whether or not the window is open
        // right now, so it's already correct the moment it starts.
        // An app window's audio isn't Studio's to decide (it doesn't own the
        // window) -- leave whatever mute state OBS has alone, don't reset it.
        if (view.muted !== undefined) await this.setInputMuted(name, Boolean(view.muted)).catch(() => {});
        // An app window's cursor setting is ours to manage (a web window's is
        // fixed at creation); applied whether or not the window is open.
        if (view.showCursor !== undefined) {
          const seen = this.inputs.find((i) => i.name === name);
          if (seen && Boolean(seen.showCursor) !== Boolean(view.showCursor)) {
            await this.obs.call('SetInputSettings', { inputName: name, inputSettings: this.backend.cursorSettings(Boolean(view.showCursor)), overlay: true }).catch(() => {});
          }
        }
        if (!windowId) continue; // window not open or not yet visible
        const current = this.inputs.find((i) => i.name === name);
        const unchanged = current && current.window === windowId;
        if (unchanged && !force.has(view.id)) continue;
        if (!unchanged) {
          await this.pointInput(name, windowId);
          report.pointed.push(name);
        }
        if (force.has(view.id)) {
          await this.restartCapture(name, windowId);
          report.restarted.push(name);
        }
      }
      // Window-level sources get a crop that removes the app's own bar.
      if (view.crop && windowId) {
        for (const name of view.sources) {
          if (!known.has(name)) continue;
          // An app window with nothing to trim shouldn't carry an empty crop
          // filter around (or keep an old one after the numbers go back to 0).
          if (view.match && !view.crop.left && !view.crop.top && !view.crop.right && !view.crop.bottom) {
            await this.removeCropFilter(name);
            continue;
          }
          await this.ensureCropFilter(name, view.crop);
          report.cropped.push(name);
          if (view.scale) await this.ensureScale(name, view.scale);
        }
      }
      for (const region of view.regions) {
        if (!region.obsSource || !known.has(region.obsSource) || !region.crop) continue;
        await this.ensureCropFilter(region.obsSource, region.crop);
        report.cropped.push(region.obsSource);
        if (view.scale && windowId) await this.ensureScale(region.obsSource, view.scale);
      }
    }
    this.emit('status', this.status());
    return report;
  }

  // ---------------------------------------------------------------------
  // Automations: scene switching and recording/streaming control, for the
  // Automations tab's own manual buttons and for rules triggered by an
  // incoming event. Reuses setSourceVisible above for show/hide-a-source.
  // ---------------------------------------------------------------------

  // [{ name, current }], the scene OBS is currently showing marked.
  async listScenes() {
    const { scenes, currentProgramSceneName } = await this.obs.call('GetSceneList');
    return scenes.map((s) => ({ name: s.sceneName, current: s.sceneName === currentProgramSceneName })).reverse();
  }

  // Every source name OBS knows, of any kind, for the Automations step
  // editor's scene/source pickers -- reuses allInputNames above rather than
  // restricting to a single input kind, since a rule can target any source.
  async listSourceNames() {
    const names = await this.allInputNames();
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  async setCurrentScene(sceneName) {
    await this.obs.call('SetCurrentProgramScene', { sceneName });
  }

  // Same, but restarts the scene if it's already the active one, instead of
  // the silent no-op OBS otherwise makes of "switch to the scene already
  // showing" -- nothing in that scene (a media source, a browser source set
  // to refresh when the scene becomes active) restarts on its own. Bounces
  // through another scene first, so this only ever fires from an
  // automation's own sceneSwitch action (a real trigger firing again, or
  // the Automations tab's "Time it" testing it) -- never from the plain
  // manual Switch button/scene buttons, where a defensive re-click on the
  // current scene should stay a genuine no-op.
  async switchToScene(sceneName) {
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    if (currentProgramSceneName === sceneName) {
      const { scenes } = await this.obs.call('GetSceneList');
      const other = scenes.find((s) => s.sceneName !== sceneName);
      if (other) await this.obs.call('SetCurrentProgramScene', { sceneName: other.sceneName });
    }
    await this.obs.call('SetCurrentProgramScene', { sceneName });
  }

  // Overwrites a text source's displayed text -- works for OBS's own text
  // input kinds (confirmed live against obs_text_pthread_source_v2, macOS's
  // text source), which all carry a plain `text` field in inputSettings.
  async setInputText(sourceName, text) {
    await this.obs.call('SetInputSettings', { inputName: sourceName, inputSettings: { text: String(text) } });
  }

  // The recording filename *format* (OBS's Output > Recording > Filename
  // Formatting) -- the only filename-related thing OBS's WebSocket API
  // actually exposes for setting; there is no request for a literal
  // one-off filename, only this template (still expanded by OBS itself at
  // record time for its own %CCYY-style macros) and the output directory.
  async setFilenameFormat(value) {
    await this.obs.call('SetProfileParameter', { parameterCategory: 'Output', parameterName: 'FilenameFormatting', parameterValue: value });
  }

  async startRecording() {
    await this.obs.call('StartRecord');
  }

  async pauseRecording() {
    await this.obs.call('PauseRecord');
  }

  async resumeRecording() {
    await this.obs.call('ResumeRecord');
  }

  async stopRecording() {
    // StopRecord's own response carries the file it just finished writing --
    // the one place OBS tells Studio this at all (no GetRecordStatus field
    // for it, and RecordStateChanged's data isn't guaranteed to arrive before
    // a caller awaiting stopRecording() needs it) -- so this is the only
    // reliable moment to capture it. uploadToYouTube (src/main.js) reads
    // this when a step doesn't override it with an explicit file.
    const { outputPath } = await this.obs.call('StopRecord');
    if (outputPath) {
      this.lastRecordingPath = outputPath;
      this.emit('recording', outputPath);
    }
  }

  async startStreaming() {
    await this.obs.call('StartStream');
  }

  async stopStreaming() {
    await this.obs.call('StopStream');
  }
}

function describeError(err) {
  const msg = (err && err.message) || String(err);
  if (/ECONNREFUSED/.test(msg)) return 'OBS is not running or its WebSocket server is off (Tools > WebSocket Server Settings).';
  if (/4009|auth/i.test(msg)) return 'OBS rejected the password.';
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host not found.';
  return msg;
}

module.exports = { ObsBridge, INPUT_KIND, WINDOWS_INPUT_KIND, BROWSER_KIND, parseWindowChoice, findAppWindow, findAppWindowChoice };
