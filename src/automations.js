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
// plain mixed-content blocking alone.
//
// So this runs its own small local Certificate Authority: a root cert
// generated once and reused, which signs the actual server certificate
// (regenerated whenever this machine's LAN addresses change, same as
// before). The server only ever presents the signed leaf, never the CA's
// private key. Trusting the *CA* rather than a specific leaf is the whole
// point: install that one root certificate on a device once (GET /ca.crt,
// no auth needed -- a CA's public certificate isn't a secret, only its
// private key is), and every certificate this CA ever issues is trusted
// automatically from then on, including a leaf regenerated later because
// this Mac's IP changed -- unlike trusting one specific self-signed leaf
// directly, which stops working the moment that leaf is replaced. The one
// real cost is that installing a root CA is a more deliberate step than
// clicking through a browser's "not private" warning (Windows' certificate
// import dialog, not just a link to click) -- worth it since it only ever
// has to happen once per device, not once per browser per certificate.

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
    this.getRules = null; // () => the currently configured rules -- see GET /api/automations/capabilities
    this.actions = []; // the static action vocabulary Studio supports, same endpoint
    this.certPem = ''; // this server's own leaf cert, PEM -- see trustsOwnAutomationsCert() in main.js
    this.caCertPem = ''; // the CA that signed it, PEM -- served at GET /ca.crt
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
  async start({ port, getToken, certDir, getRules, actions }) {
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
    this.caCertPem = cert.caCert.toString();
    this.getToken = getToken;
    this.getRules = getRules || null;
    this.actions = actions || [];
    await new Promise((resolve) => {
      const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => this.handle(req, res));
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
    this.getRules = null;
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

    // Lets a caller discover Studio's action vocabulary and the rules
    // actually configured right now, instead of hardcoding or guessing
    // either -- authenticated, like everything else that isn't the CA cert
    // itself, since rule params (scene/source names) reveal a bit about
    // this Studio's own setup.
    if (req.method === 'GET' && url === '/api/automations/capabilities') {
      if (!authed()) return send(401, { error: 'Unauthorized' });
      const rules = (this.getRules ? this.getRules() : []).map((r) => ({ event: r.event, action: r.action, param: r.param }));
      return send(200, { actions: this.actions, rules });
    }

    // No auth: a CA's public certificate isn't a secret (only its private
    // key is, which never leaves this machine) -- this is meant to be
    // fetched by whatever's about to install it, before it has any way to
    // prove it holds the token yet.
    if (req.method === 'GET' && url === '/ca.crt') {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Length': Buffer.byteLength(this.caCertPem),
        'Content-Disposition': 'attachment; filename="coffee-pub-studio-ca.crt"',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(this.caCertPem);
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

// Loads the CA (generating it once, on the first ever start) and the
// leaf cert it signs for this server (regenerated whenever it's missing,
// doesn't cover every LAN address this machine has right now, or -- an
// upgrade case -- isn't actually signed by the current CA, e.g. a leaf
// left over from before this app used a CA at all). All via the
// macOS-provided `openssl` CLI, present on every Mac, so no dependency to
// add.
function ensureCert(certDir) {
  const caKeyPath = path.join(certDir, 'automations-ca-key.pem');
  const caCertPath = path.join(certDir, 'automations-ca-cert.pem');
  if (!fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)) {
    generateCa(caKeyPath, caCertPath);
  }

  const keyPath = path.join(certDir, 'automations-key.pem');
  const certPath = path.join(certDir, 'automations-cert.pem');
  const addresses = lanAddresses();
  const stale =
    !fs.existsSync(keyPath) ||
    !fs.existsSync(certPath) ||
    !certCoversAddresses(certPath, addresses) ||
    !certIssuedBy(certPath, caCertPath);
  if (stale) generateLeafCert(keyPath, certPath, caKeyPath, caCertPath, addresses);

  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), caCert: fs.readFileSync(caCertPath) };
}

function certCoversAddresses(certPath, addresses) {
  try {
    const text = execFileSync('openssl', ['x509', '-noout', '-text', '-in', certPath]).toString();
    return addresses.every((ip) => text.includes(`IP Address:${ip}`));
  } catch (err) {
    return false;
  }
}

function certIssuedBy(certPath, caCertPath) {
  try {
    execFileSync('openssl', ['verify', '-CAfile', caCertPath, certPath]);
    return true;
  } catch (err) {
    return false;
  }
}

// A self-signed root, generated once and reused for as long as its files
// exist -- deliberately never touched by the "stale" check the leaf gets,
// since the whole point of installing it once on a device is that it
// keeps working across every future leaf this CA signs.
function generateCa(keyPath, certPath) {
  const configText = [
    '[req]',
    'distinguished_name = req_distinguished_name',
    'x509_extensions = v3_ca',
    'prompt = no',
    '[req_distinguished_name]',
    'CN = Coffee Pub Studio Local CA',
    '[v3_ca]',
    'basicConstraints = critical, CA:true',
    'keyUsage = critical, keyCertSign, cRLSign',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const tmpConfig = path.join(os.tmpdir(), `cp-studio-automations-ca-${process.pid}-${Date.now()}.cnf`);
  fs.writeFileSync(tmpConfig, configText);
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-config', tmpConfig,
    ]);
  } finally {
    fs.unlinkSync(tmpConfig);
  }
}

// The server's actual certificate: a request (CSR) with this machine's
// current addresses as its SAN, signed by the CA above. `x509 -req` does
// not carry a CSR's own extensions into the signed certificate by itself
// -- `-extfile`/`-extensions` is what actually copies the SAN over, so the
// same config file is reused for both the request and the signing step.
function generateLeafCert(keyPath, certPath, caKeyPath, caCertPath, addresses) {
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map((ip) => `IP:${ip}`)].join(',');
  const configText = [
    '[req]',
    'distinguished_name = req_distinguished_name',
    'req_extensions = v3_req',
    'prompt = no',
    '[req_distinguished_name]',
    'CN = Coffee Pub Studio Automations',
    '[v3_req]',
    `subjectAltName = ${san}`,
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const stamp = `${process.pid}-${Date.now()}`;
  const tmpConfig = path.join(os.tmpdir(), `cp-studio-automations-req-${stamp}.cnf`);
  const csrPath = path.join(os.tmpdir(), `cp-studio-automations-csr-${stamp}.pem`);
  fs.writeFileSync(tmpConfig, configText);
  try {
    execFileSync('openssl', [
      'req', '-newkey', 'rsa:2048', '-sha256', '-nodes',
      '-keyout', keyPath, '-out', csrPath, '-config', tmpConfig,
    ]);
    execFileSync('openssl', [
      'x509', '-req', '-in', csrPath, '-CA', caCertPath, '-CAkey', caKeyPath, '-CAcreateserial',
      '-out', certPath, '-days', '3650', '-sha256', '-extfile', tmpConfig, '-extensions', 'v3_req',
    ]);
  } finally {
    fs.unlinkSync(tmpConfig);
    if (fs.existsSync(csrPath)) fs.unlinkSync(csrPath);
  }
}

module.exports = { AutomationsServer };
