'use strict';

// Bridge to a Coffee Pub Tavern server: signs in as an admin, fetches the
// stream key and the party with live state, and builds OBS view links.

const EventEmitter = require('events');

const POLL_MS = 5000;
const RECONNECT_MS = 15000;
const TIMEOUT_MS = 8000;

class TavernBridge extends EventEmitter {
  /**
   * @param {object} options
   * @param {() => {url: string, login: string, autoConnect: boolean}} options.getSettings
   * @param {() => string} options.getPassword
   * @param {(url: string, login: string) => string} [options.getTrustCookie] the saved `mfa_trust` cookie for this server and account, if any, so a two-step account isn't asked for a code every sign-in
   * @param {(url: string, login: string, cookie: string) => void} [options.saveTrustCookie] called with '' to clear
   */
  constructor({ getSettings, getPassword, getTrustCookie = () => '', saveTrustCookie = () => {} }) {
    super();
    this.getSettings = getSettings;
    this.getPassword = getPassword;
    this.getTrustCookie = getTrustCookie;
    this.saveTrustCookie = saveTrustCookie;
    this.state = 'disconnected';
    this.message = '';
    this.suspended = false;
    this.token = '';
    this.streamKey = '';
    this.me = null;
    this.branding = null;
    // The server's `pending` token while a two-step code is outstanding
    // (POST /api/login answered mfaRequired instead of a session); cleared
    // once verifyCode() succeeds, the pending token itself expires, or the
    // attempt is cancelled.
    this.mfaPending = '';
    // The most recent response's raw Set-Cookie headers, read right after
    // request() so verifyCode() can pull the `mfa_trust` cookie out of a
    // POST /api/login/verify response without request() needing to know
    // what a caller wants from them.
    this.lastSetCookie = [];
    this.party = []; // users with live state, as /api/status reports them
    this.rooms = []; // the Lobby and the rooms an admin curated
    this.activeRoom = 'lobby'; // the room the stream currently hears (whoever's admin is in it)
    // The keyed page paths this environment's installed, enabled modules
    // currently serve (e.g. "view", once the Stream module is on) -- `null`
    // (not an empty array) until a real poll answers, and stays `null`
    // forever against a server too old to report this field at all, so
    // hasViewModule() below can tell "definitely not installed" (an array
    // without "view" in it) apart from "this server doesn't say" (treated
    // as "assume it's fine," the same as Studio's behavior before this
    // field existed -- an older/self-hosted Tavern shouldn't start
    // showing a false "module missing" warning just because it hasn't
    // been asked to update).
    this.pages = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.connecting = null;
    this.lastPoll = 0;
  }

  status() {
    return {
      state: this.state,
      message: this.message,
      url: this.getSettings().url,
      serverName: this.branding?.serverName || '',
      version: this.branding?.version || '',
      streamKey: this.streamKey,
      party: this.party,
      rooms: this.rooms,
      activeRoom: this.activeRoom,
      lastPoll: this.lastPoll,
      hasViewModule: this.hasViewModule(),
    };
  }

  // "Assume yes" when the server hasn't reported `pages` at all (an older
  // or self-hosted Tavern that predates this field) -- only an explicit
  // array missing "view" means the Stream module is genuinely off or
  // uninstalled on this environment. See the `pages` field comment above.
  hasViewModule() {
    return this.pages === null || this.pages.includes('view');
  }

  get connected() {
    return this.state === 'connected';
  }

  setState(state, message = '') {
    this.state = state;
    this.message = message;
    this.emit('status', this.status());
  }

  async start() {
    clearTimeout(this.reconnectTimer);
    const { enabled, url, autoConnect } = this.getSettings();
    if (!enabled || !autoConnect || !url) return;
    await this.connect().catch(() => {});
  }

  async stop() {
    clearTimeout(this.reconnectTimer);
    this.stopPolling();
  }

  async disconnect() {
    clearTimeout(this.reconnectTimer);
    this.stopPolling();
    this.suspended = true;
    this.token = '';
    this.streamKey = '';
    this.mfaPending = '';
    this.party = [];
    this.rooms = [];
    this.activeRoom = 'lobby';
    this.setState('disconnected', 'Disconnected.');
  }

  // Backs out of an outstanding two-step prompt without touching
  // `autoConnect`'s own reconnect schedule the way a full disconnect() does.
  cancelMfa() {
    this.mfaPending = '';
    this.setState('disconnected', 'Sign-in cancelled.');
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const { enabled, autoConnect } = this.getSettings();
    if (!enabled || !autoConnect || this.suspended) return;
    this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), RECONNECT_MS);
  }

  async connect() {
    if (this.connecting) return this.connecting;
    this.suspended = false;
    const { enabled, url, login } = this.getSettings();
    if (!enabled) {
      this.setState('disconnected', 'Coffee Pub Tavern is turned off.');
      throw new Error(this.message);
    }
    if (!url) {
      this.setState('error', 'Enter the Tavern address first.');
      throw new Error(this.message);
    }
    this.setState('connecting', `Signing in to ${url}...`);
    const attempt = (async () => {
      try {
        const password = this.getPassword();
        if (!login || !password) throw new Error('Enter the admin login and password.');
        // A previously remembered device skips the code entirely; the
        // server ignores an empty or stale cookie the same as none at all.
        const trust = this.getTrustCookie(url, login);
        const auth = await this.request('POST', '/api/login', { login, password }, { anonymous: true, cookie: trust });
        if (auth.mfaRequired) {
          if (auth.enrol) {
            throw new Error('This account needs two-step sign-in set up first. Sign in once in a browser, then try again.');
          }
          // No session yet -- verifyCode() finishes this same sign-in once
          // the person enters the code from their authenticator app.
          this.mfaPending = auth.pending;
          this.setState('mfa', 'Enter the six-digit code from your authenticator app.');
          return;
        }
        this.mfaPending = '';
        this.token = auth.token;
        await this.afterSignIn();
      } catch (err) {
        this.mfaPending = '';
        this.token = '';
        this.setState('error', describeError(err));
        this.scheduleReconnect();
        throw new Error(this.message);
      }
    })();
    // Clear the in-progress marker only once the attempt has settled; a
    // synchronous failure inside the attempt must not leave it set forever.
    this.connecting = attempt.finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  // Finishes a sign-in once a real token exists, whether it came straight
  // from POST /api/login or from verifyCode() after a two-step prompt --
  // both leave `this.token` set the same way, so this is the one place
  // that reads /api/me, applies the role check and starts polling.
  async afterSignIn() {
    const me = await this.request('GET', '/api/me');
    // The Magpie rename splits the old single 'admin' role into 'owner'
    // (an environment's own admin) and 'admin' (the host's stand-in) --
    // Studio's sign-in check always meant either of those, never
    // 'member' or 'guest', so both are accepted here.
    if (!isElevatedRole(me.user.role)) throw new Error(`${me.user.displayName} is not an admin on this server.`);
    this.me = me.user;
    this.streamKey = me.streamKey || '';
    // `environmentName` is the rename of `serverName`; read the new name
    // first and fall back to the old one, so this works against a server
    // before or after that rename ships. `tableName` is alias-only now
    // (the renamed API has no table name at all) and Studio never
    // displayed it, so it's no longer captured.
    this.branding = { serverName: me.environmentName || me.serverName, version: me.version };
    await this.poll();
    this.setState('connected', `Signed in to ${this.branding.serverName} as ${me.user.displayName}.`);
    this.startPolling();
    this.emit('connected');
  }

  // Completes the sign-in connect() paused for a two-step code. The
  // pending token lasts ten minutes and survives a wrong code, so a retry
  // reuses it; it does not survive its own expiry, which the server reports
  // as "sign in again" -- that's the one failure that has to start over
  // from connect().
  async verifyCode(code) {
    if (!this.mfaPending) throw new Error('Not waiting for a code.');
    const { url, login } = this.getSettings();
    this.setState('connecting', 'Checking your code...');
    try {
      const result = await this.request('POST', '/api/login/verify', { pending: this.mfaPending, code, remember: true }, { anonymous: true });
      const trustCookie = extractCookieValue(this.lastSetCookie, 'mfa_trust');
      if (trustCookie) this.saveTrustCookie(url, login, trustCookie);
      this.mfaPending = '';
      this.token = result.token;
      await this.afterSignIn();
    } catch (err) {
      const message = describeError(err);
      if (/sign in again/i.test(message)) this.mfaPending = '';
      this.token = '';
      this.setState(this.mfaPending ? 'mfa' : 'error', message);
      if (!this.mfaPending) this.scheduleReconnect();
      throw new Error(this.message);
    }
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.poll().catch((err) => this.onPollError(err)), POLL_MS);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  onPollError(err) {
    if (this.state !== 'connected') return;
    this.stopPolling();
    this.token = '';
    this.setState('error', `Lost the Tavern: ${describeError(err)}`);
    this.scheduleReconnect();
  }

  // The party with live state; emits 'party' when anything changed.
  async poll() {
    const status = await this.request('GET', '/api/status');
    const next = status.users.map((u) => ({
      key: u.key,
      login: u.login,
      displayName: u.displayName,
      // See the same normalization in connect(): 'owner' and 'admin' both
      // mean "the person running the show" to Studio.
      role: u.role === 'owner' || u.role === 'admin' ? 'admin' : u.role,
      images: u.images,
      player: u.player,
      viewUrl: u.viewUrl,
      // `online.space` is the rename of `online.room`; fold it into `.room`
      // here so every other place in Studio that reads `user.online.room`
      // keeps working unchanged, against either server shape.
      online: u.online && { ...u.online, room: u.online.space || u.online.room },
    }));
    this.branding = { serverName: status.environmentName || status.serverName, version: status.version };
    this.lastPoll = Date.now();
    // `spaces`/`activeSpace` are the rename of `rooms`/`activeRoom` -- prefer
    // them, falling back to the old names for a server that hasn't shipped
    // the rename yet. Row shape (id, name, members, ephemeral, private, ...)
    // is unchanged either way. Servers before rooms/spaces existed report
    // neither: everyone is in the Lobby.
    const spaceRows = Array.isArray(status.spaces) && status.spaces.length
      ? status.spaces
      : Array.isArray(status.rooms) && status.rooms.length
      ? status.rooms
      : null;
    const rooms = spaceRows || [{ id: 'lobby', name: 'Lobby', description: 'Everyone at the table.', members: next.map((u) => u.key), isLobby: true, hasImage: false, profile: 'roleplaying' }];
    const activeRoom = typeof status.activeSpace === 'string'
      ? status.activeSpace
      : typeof status.activeRoom === 'string'
      ? status.activeRoom
      : 'lobby';
    // `null`, not `[]`, when the server doesn't report this field at all --
    // see the `pages` field comment above for why that distinction matters.
    const pages = Array.isArray(status.pages) ? status.pages : null;
    const changed =
      JSON.stringify(next) !== JSON.stringify(this.party) ||
      JSON.stringify(rooms) !== JSON.stringify(this.rooms) ||
      activeRoom !== this.activeRoom ||
      JSON.stringify(pages) !== JSON.stringify(this.pages);
    this.party = next;
    this.rooms = rooms;
    this.activeRoom = activeRoom;
    this.pages = pages;
    if (changed) {
      this.emit('party', this.party);
      this.emit('status', this.status());
    }
    return this.party;
  }

  // OBS view link for a user: kind is 'player' or 'character' -- still
  // 'player' on the wire for back-compat with already-published OBS scenes,
  // even though the Tavern's own UI (and Studio's) now call it Participant.
  // The name plate, border and overlays are the user's Participant options
  // on the Tavern.
  viewUrl(user, { kind = 'player' } = {}) {
    const base = `${this.getSettings().url}/view/${encodeURIComponent(user.key)}`;
    const q = new URLSearchParams({ s: this.streamKey, kind });
    return `${base}?${q}`;
  }

  imageUrl(user, slot = 'player') {
    return `${this.getSettings().url}/img/${encodeURIComponent(user.key)}/${slot}?s=${encodeURIComponent(this.streamKey)}`;
  }

  // The room the Tavern tab shows, falling back to the Lobby when the chosen
  // one is gone, and the users who belong to it.
  room(id) {
    return this.rooms.find((r) => r.id === id) || this.rooms.find((r) => r.isLobby) || this.rooms[0] || null;
  }

  membersOf(id) {
    const room = this.room(id);
    if (!room) return this.party;
    return this.party.filter((u) => room.members.includes(u.key));
  }

  async request(method, pathname, body, { anonymous = false, cookie = '' } = {}) {
    const { url } = this.getSettings();
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    if (!anonymous) {
      if (!this.token) throw new Error('Not signed in.');
      headers.authorization = `Bearer ${this.token}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${url}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      // Read before the body, so a caller (verifyCode(), for the
      // `mfa_trust` cookie) can inspect it even if the response fails to
      // parse as JSON below.
      this.lastSetCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        data = {};
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Pulls `name=value` out of a Set-Cookie header list, dropping the
// attributes (Path, Max-Age, ...) -- the shape `request()`'s `cookie`
// option expects to send straight back.
function extractCookieValue(setCookieHeaders, name) {
  for (const header of setCookieHeaders || []) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return `${name}=${match[1]}`;
  }
  return '';
}

// 'owner' (an environment's own admin) or 'admin' (the host's stand-in) --
// the two roles Magpie's rename split the old single 'admin' role into.
function isElevatedRole(role) {
  return role === 'admin' || role === 'owner';
}

function describeError(err) {
  const msg = (err && err.message) || String(err);
  if (/aborted|AbortError/i.test(msg)) return 'The Tavern did not answer in time.';
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'Could not reach the Tavern at that address.';
  if (/wrong login or password/i.test(msg)) return 'The Tavern rejected the login or password.';
  return msg;
}

module.exports = { TavernBridge };
