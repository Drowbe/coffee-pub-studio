'use strict';

// A small local HTTPS server Foundry modules (Herald first) call to report
// events, which a user-configured rule can turn into an OBS action (switch
// scene, show/hide a source, start/stop recording or streaming). Foundry
// usually runs on a different machine than Studio -- this app assumes a Mac,
// Foundry a Windows box on the same LAN -- so this listens on every
// interface, not just localhost. The token is the only thing standing
// between that open port and anyone else on the network: the server refuses
// to start without one.
//
// HTTPS, not HTTP, and not optional: Foundry is commonly served over HTTPS
// (the README's own examples are), and a browser flatly blocks an HTTPS
// page from making a plain-HTTP fetch at all -- "mixed content" -- no CORS
// header fixes that, confirmed against how Chrome's Private Network Access
// policy treats exactly this shape of request (a public HTTPS origin
// reaching into a private/LAN address), which is stricter about it than
// plain mixed-content blocking alone. So this generates and serves a
// self-signed certificate; the one real cost is that whoever's setting up
// the Foundry side has to open this server's address directly in a browser
// once and click through the "not trusted" warning before fetch() calls
// from a module will succeed -- there's no way around a self-signed cert
// needing that, and it only has to happen once per browser.

const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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
    this.certPem = ''; // this server's own cert, PEM -- see trustOwnCertificate() in main.js
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
  // server. `certDir` is where the self-signed cert/key pair is generated
  // and reused across restarts -- reusing it matters, since a browser's
  // one-time "trust this" exception is tied to the actual certificate, and
  // a fresh one on every launch would mean re-clicking through the warning
  // every time.
  async start({ port, getToken, certDir }) {
    await this.stop();
    if (!getToken()) {
      this.setState('error', 'Set a token before enabling Automations.');
      return;
    }
    let cert;
    try {
      cert = ensureCert(certDir);
    } catch (err) {
      this.setState('error', `Could not create a TLS certificate: ${err.message}`);
      return;
    }
    this.certPem = cert.cert.toString();
    this.getToken = getToken;
    await new Promise((resolve) => {
      const server = https.createServer(cert, (req, res) => this.handle(req, res));
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
      res.writeHead(code, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
        'Access-Control-Allow-Origin': '*',
      });
      res.end(json);
    };
    const authed = () => {
      const header = req.headers.authorization || '';
      const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
      return timingSafeEqualStr(provided, (this.getToken && this.getToken()) || '');
    };
    const url = (req.url || '').split('?')[0];

    // A browser sends this before the real request whenever it carries a
    // JSON body and an Authorization header (both "non-simple" by CORS'
    // own rules) -- a Foundry module's fetch() is exactly that shape, so
    // without this the real POST never leaves the browser at all. Auth
    // isn't checked here: the token travels on the real request, and a
    // preflight carries no credentials of its own to check.
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }

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

// Loads the self-signed cert/key pair in certDir, generating one (via the
// macOS-provided `openssl` CLI -- present on every Mac, so no dependency to
// add) if there is none yet, or if the current one doesn't cover every LAN
// address this machine has right now (an address list openssl itself has
// no notion of, so this is the one thing worth checking on every start
// rather than just "does a file exist").
function ensureCert(certDir) {
  const keyPath = path.join(certDir, 'automations-key.pem');
  const certPath = path.join(certDir, 'automations-cert.pem');
  const addresses = lanAddresses();
  const stale = !fs.existsSync(keyPath) || !fs.existsSync(certPath) || !certCoversAddresses(certPath, addresses);
  if (stale) generateSelfSignedCert(keyPath, certPath, addresses);
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

function certCoversAddresses(certPath, addresses) {
  try {
    const text = execFileSync('openssl', ['x509', '-noout', '-text', '-in', certPath]).toString();
    return addresses.every((ip) => text.includes(`IP Address:${ip}`));
  } catch (err) {
    return false;
  }
}

function generateSelfSignedCert(keyPath, certPath, addresses) {
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map((ip) => `IP:${ip}`)].join(',');
  const configText = [
    '[req]',
    'distinguished_name = req_distinguished_name',
    'x509_extensions = v3_req',
    'prompt = no',
    '[req_distinguished_name]',
    'CN = Coffee Pub Studio Automations',
    '[v3_req]',
    `subjectAltName = ${san}`,
    '',
  ].join('\n');
  fs.mkdirSync(certDirOf(keyPath), { recursive: true });
  const tmpConfig = path.join(os.tmpdir(), `cp-studio-automations-${process.pid}-${Date.now()}.cnf`);
  fs.writeFileSync(tmpConfig, configText);
  try {
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '3650',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-config',
      tmpConfig,
    ]);
  } finally {
    fs.unlinkSync(tmpConfig);
  }
}

function certDirOf(keyPath) {
  return path.dirname(keyPath);
}

module.exports = { AutomationsServer };
