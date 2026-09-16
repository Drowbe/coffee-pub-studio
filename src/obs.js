'use strict';

// Bridge to OBS Studio over its built-in WebSocket server (obs-websocket v5,
// OBS 28+). Keeps OBS "macOS Screen Capture" inputs pointed at this app's
// windows, whose system window IDs change on every launch.

const EventEmitter = require('events');
// JSON encoding: human-readable on the wire and easy to test; OBS speaks both.
const { OBSWebSocket } = require('obs-websocket-js/json');

const INPUT_KIND = 'screen_capture'; // macOS Screen Capture (ScreenCaptureKit)
const CAPTURE_TYPE_WINDOW = 1; // settings.type: 0 display, 1 window, 2 application
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
    this.inputs = []; // window-capture inputs known in OBS: [{ name, window }]
    this.lastSync = null;
    this.reconnectTimer = null;
    this.connecting = null;
    this.outputs = { recording: false, recordingPaused: false, recordTime: '', streaming: false, streamTime: '', scene: '' };
    this.pollTimer = null;

    this.obs.on('ConnectionClosed', (err) => {
      this.stopPolling();
      if (this.suspended) return; // our own disconnect() already reported it
      const wasConnected = this.state === 'connected';
      this.inputs = [];
      this.setState('disconnected', wasConnected ? 'Connection to OBS closed.' : (err && err.message) || '');
      this.scheduleReconnect();
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
      lastSync: this.lastSync,
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

  // All macOS Screen Capture inputs in window mode, with the window ID each
  // one currently points at.
  async refreshInputs() {
    if (!this.connected && this.state !== 'connecting') return [];
    const { inputs } = await this.obs.call('GetInputList', { inputKind: INPUT_KIND });
    const result = [];
    for (const input of inputs) {
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: input.inputName });
      const type = inputSettings.type === undefined ? CAPTURE_TYPE_WINDOW : inputSettings.type;
      if (type !== CAPTURE_TYPE_WINDOW) continue;
      result.push({ name: input.inputName, window: inputSettings.window || 0 });
    }
    this.inputs = result;
    this.emit('status', this.status());
    return result;
  }

  // OBS's own list of capturable windows: [{ itemName, itemValue }]. Needs at
  // least one window-capture input to read the property from.
  async windowChoices() {
    const probe = this.inputs[0];
    if (!probe) return [];
    const { propertyItems } = await this.obs.call('GetInputPropertiesListPropertyItems', {
      inputName: probe.name,
      propertyName: 'window',
    });
    return propertyItems || [];
  }

  async pointInput(inputName, windowId) {
    await this.obs.call('SetInputSettings', {
      inputName,
      inputSettings: { type: CAPTURE_TYPE_WINDOW, window: windowId },
      overlay: true,
    });
  }

  // Make OBS start the capture again, as the "Restart capture" button in the
  // source's properties does. A capture that began while the window was not
  // yet on screen never produces frames until this happens.
  async restartCapture(inputName, windowId) {
    try {
      await this.obs.call('PressInputPropertiesButton', { inputName, propertyName: 'reactivate_capture' });
      return 'button';
    } catch (err) {
      // Fallback: clearing and re-setting the window forces a new capture.
      await this.obs.call('SetInputSettings', { inputName, inputSettings: { type: CAPTURE_TYPE_WINDOW, window: 0 }, overlay: true });
      await this.pointInput(inputName, windowId);
      return 'reset';
    }
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

  async createInput(inputName, windowId) {
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    await this.obs.call('CreateInput', {
      sceneName: currentProgramSceneName,
      inputName,
      inputKind: INPUT_KIND,
      inputSettings: { type: CAPTURE_TYPE_WINDOW, window: windowId, show_cursor: false },
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
    const report = { pointed: [], cropped: [], missing: [], detected: [], restarted: [] };
    // Every name some window or region already owns; those are never "detected".
    const owned = new Set(views.flatMap((v) => [...v.sources, ...(v.allRegionSources || v.regions.map((r) => r.obsSource))]));

    // Prefer the window ID OBS itself reports for our title; fall back to
    // the ID Electron knows.
    const resolveId = (view) => {
      const match = choices.find((c) => typeof c.itemName === 'string' && c.itemName.endsWith(view.title));
      if (match && Number.isInteger(match.itemValue)) return match.itemValue;
      return view.windowId;
    };

    for (const view of views) {
      const windowId = resolveId(view);
      // Detect unowned inputs already pointing at this window.
      for (const input of this.inputs) {
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
        await this.setInputMuted(name, Boolean(view.muted)).catch(() => {});
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
    this.lastSync = { at: Date.now(), ...report };
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
    await this.obs.call('StopRecord');
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

module.exports = { ObsBridge, INPUT_KIND, BROWSER_KIND };
