'use strict';

// A small local HTTP server Foundry modules (Herald first) call to report
// events, which a user-configured rule can turn into an OBS action (switch
// scene, show/hide a source, start/stop recording or streaming). Foundry
// usually runs on a different machine than Studio -- this app assumes a Mac,
// Foundry a Windows box on the same LAN -- so this listens on every
// interface, not just localhost. The token is the only thing standing
// between that open port and anyone else on the network: the server refuses
// to start without one.

const http = require('http');
const crypto = require('crypto');
const os = require('os');
const EventEmitter = require('events');

const MAX_BODY_BYTES = 16 * 1024; // an event payload has no business being bigger than this
const EVENT_LOG_LIMIT = 50;

class AutomationsServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.state = 'stopped'; // stopped | listening | error
    this.message = '';
    this.port = 0;
    this.getToken = null;
    this.events = []; // recent received events, newest first -- the tab's own log
  }

  status() {
    return {
      state: this.state,
      message: this.message,
      port: this.port,
      addresses: this.state === 'listening' ? lanAddresses() : [],
      events: this.events,
    };
  }

  get listening() {
    return this.state === 'listening';
  }

  setState(state, message = '') {
    this.state = state;
    this.message = message;
    this.emit('status', this.status());
  }

  // `getToken` is read fresh on every request rather than captured once, so
  // rotating the token in settings takes effect without restarting the
  // server.
  async start({ port, getToken }) {
    await this.stop();
    if (!getToken()) {
      this.setState('error', 'Set a token before enabling Automations.');
      return;
    }
    this.getToken = getToken;
    await new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.on('error', (err) => {
        this.server = null;
        this.setState('error', describeError(err));
        resolve();
      });
      server.listen(port, () => {
        this.server = server;
        this.port = port;
        this.setState('listening', `Listening on port ${port}.`);
        resolve();
      });
    });
  }

  async stop() {
    this.getToken = null;
    if (!this.server) {
      if (this.state !== 'stopped') this.setState('stopped', '');
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(resolve));
    this.setState('stopped', '');
  }

  handle(req, res) {
    const send = (code, body) => {
      const json = JSON.stringify(body);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
      res.end(json);
    };
    const authed = () => {
      const header = req.headers.authorization || '';
      const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
      return timingSafeEqualStr(provided, (this.getToken && this.getToken()) || '');
    };
    const url = (req.url || '').split('?')[0];

    if (req.method === 'GET' && url === '/api/automations/ping') {
      if (!authed()) return send(401, { error: 'Unauthorized' });
      return send(200, { ok: true });
    }

    if (req.method === 'POST' && url === '/api/automations/event') {
      if (!authed()) return send(401, { error: 'Unauthorized' });
      let size = 0;
      const chunks = [];
      let tooBig = false;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          tooBig = true;
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooBig) return;
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch (err) {
          return send(400, { error: 'Invalid JSON' });
        }
        const event = typeof body.event === 'string' ? body.event.trim().slice(0, 60) : '';
        if (!event) return send(400, { error: '"event" is required' });
        const data = body.data && typeof body.data === 'object' ? body.data : {};
        this.recordEvent(event, data);
        send(200, { ok: true });
      });
      return;
    }

    send(404, { error: 'Not found' });
  }

  // Shared by a real incoming POST and the control panel's own "send test
  // event" button, so a manual test exercises the exact same rule-matching
  // and event-log path a real Herald call would.
  recordEvent(event, data = {}) {
    const entry = { event, data, at: Date.now() };
    this.events.unshift(entry);
    this.events.length = Math.min(this.events.length, EVENT_LOG_LIMIT);
    this.emit('event', entry);
    this.emit('status', this.status());
    return entry;
  }
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Non-internal IPv4 addresses this machine can be reached at, so the tab can
// show the user what to put in Herald's settings -- Foundry is typically on
// a different machine on the same LAN, so "localhost" is the wrong answer.
function lanAddresses() {
  const nets = os.networkInterfaces();
  const result = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}

function describeError(err) {
  if (err && err.code === 'EADDRINUSE') return 'That port is already in use.';
  if (err && err.code === 'EACCES') return 'Permission denied for that port (try one above 1024).';
  return (err && err.message) || String(err);
}

module.exports = { AutomationsServer };
