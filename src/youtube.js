'use strict';

const fs = require('fs');

// Uploads a finished recording to YouTube via the Data API v3's resumable
// upload endpoint. No SDK -- same reasoning as automations.js's hand-rolled
// HTTPS server and obs.js's direct WebSocket calls: this is plain REST plus
// OAuth, both well-specified enough that `googleapis` (a large dependency
// for what amounts to a handful of fetch calls) isn't worth adding.
//
// Auth is OAuth 2.0's Device Authorization Grant (RFC 8628), not the more
// common loopback-redirect flow -- deliberately. A loopback flow needs a
// local HTTP server, a free port, and an exact redirect URI registered in
// Google Cloud Console; the device flow needs none of that: Studio asks
// Google for a short user code, shows it, and the person visits a URL (on
// *any* device, not necessarily this Mac) and types the code in. This
// requires the Google Cloud OAuth client to be the "TVs and Limited Input
// devices" type specifically -- "Desktop app" and "Web application" client
// types do not support this grant.
//
// Nothing here is wired into any rule set automatically -- see
// runAutomationAction's 'uploadToYouTube' case, src/main.js.

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
// youtube.upload is enough for videos.insert (confirmed live) but not for
// playlistItems.insert, which is why there's no add-to-playlist support
// here -- the broader scope that needs (youtube.force-ssl) was tried and
// reverted after Google's device-code endpoint rejected it outright for a
// "TVs and Limited Input devices" OAuth client with "Invalid device flow
// scope", confirmed live. See "Playlist support" in
// architecture-automations.md before trying another scope here.
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

// Must be a multiple of 256 KiB per the resumable upload protocol; 8 MiB
// balances progress granularity (a very large file reports too rarely at a
// bigger chunk size) against request overhead (too small and a multi-GB
// file is thousands of round trips).
const CHUNK_SIZE = 8 * 1024 * 1024;

function formBody(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

class YouTubeUploader {
  /**
   * @param {object} options
   * @param {() => {clientId: string, clientSecret: string, refreshToken: string}} options.getCredentials
   * @param {(refreshToken: string) => void} options.saveRefreshToken -- persists a newly-issued refresh token
   * @param {() => object|null} [options.loadUploadSession] -- the in-flight resumable session saved by the last interrupted upload, if any
   * @param {(session: object|null) => void} [options.saveUploadSession] -- persists (or, with null, clears) that session
   */
  constructor({ getCredentials, saveRefreshToken, loadUploadSession, saveUploadSession }) {
    this.getCredentials = getCredentials;
    this.saveRefreshToken = saveRefreshToken;
    this.loadUploadSession = loadUploadSession || (() => null);
    this.saveUploadSession = saveUploadSession || (() => {});
    this.accessToken = '';
    this.accessTokenExpiresAt = 0; // ms epoch
  }

  // Step 1 of the device flow: ask Google for a code to show the user.
  // Resolves fast (one request) -- the caller shows userCode/verificationUrl
  // immediately, then separately calls pollForToken to wait for approval.
  async requestDeviceCode() {
    const { clientId } = this.getCredentials();
    if (!clientId) throw new Error('Set a YouTube Client ID first.');
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ client_id: clientId, scope: SCOPE }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(googleErrorMessage(data, `Device code request failed (${res.status}).`));
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUrl: data.verification_url || data.verification_uri,
      interval: Number(data.interval) || 5,
      expiresIn: Number(data.expires_in) || 1800,
    };
  }

  // Step 2: poll the token endpoint until the person approves (or the code
  // expires, or they decline). Resolves with the refresh token once done;
  // the caller is expected to persist it (this class doesn't call
  // saveRefreshToken itself here -- only setRefreshToken/getAccessToken's
  // silent-refresh path does, since a *device-flow* grant should always
  // hand back a fresh refresh token to store).
  async pollForToken({ deviceCode, interval, expiresIn }) {
    const { clientId, clientSecret } = this.getCredentials();
    const deadline = Date.now() + expiresIn * 1000;
    let waitSeconds = interval;
    while (Date.now() < deadline) {
      await sleep(waitSeconds * 1000);
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
          client_id: clientId,
          client_secret: clientSecret,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.accessToken = data.access_token;
        this.accessTokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
        if (data.refresh_token) this.saveRefreshToken(data.refresh_token);
        return;
      }
      if (data.error === 'authorization_pending') continue;
      if (data.error === 'slow_down') {
        waitSeconds += 5;
        continue;
      }
      if (data.error === 'access_denied') throw new Error('YouTube sign-in was declined.');
      if (data.error === 'expired_token') throw new Error('That code expired before it was approved -- try connecting again.');
      throw new Error(googleErrorMessage(data, `YouTube sign-in failed (${res.status}).`));
    }
    throw new Error('Timed out waiting for YouTube sign-in approval.');
  }

  // A cached access token if it's still good for another minute, otherwise
  // a fresh one via the stored refresh token. Throws if never connected.
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) return this.accessToken;
    const { clientId, clientSecret, refreshToken } = this.getCredentials();
    if (!refreshToken) throw new Error('Not connected to YouTube -- connect it on the Automations tab first.');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(googleErrorMessage(data, `Refreshing the YouTube connection failed (${res.status}) -- try disconnecting and reconnecting.`));
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return this.accessToken;
  }

  disconnect() {
    this.accessToken = '';
    this.accessTokenExpiresAt = 0;
  }

  /**
   * Uploads one file, reporting progress as it goes. Resumable two ways: a
   * failed chunk retries on its own, and the session URL is saved to disk so
   * an interrupted upload (cancelled, crashed, app quit) picks up where it
   * left off next time instead of starting over -- as long as it's the same
   * file with the same metadata and YouTube still honors the session.
   * @param {string} filePath
   * @param {{title: string, description: string, categoryId: string, privacyStatus: string, selfDeclaredMadeForKids: boolean}} metadata
   * @param {(fraction: number) => void} [onProgress] -- 0..1
   * @param {AbortSignal} [signal] -- aborting throws "Upload cancelled." and keeps the saved session for a later resume
   * @returns {Promise<{videoId: string, url: string, resumed: boolean}>}
   */
  async uploadVideo(filePath, metadata, onProgress, signal) {
    const stat = fs.statSync(filePath); // throws with a clear ENOENT if the file's gone -- deliberately not caught here
    const totalSize = stat.size;
    const token = await this.getAccessToken();
    const cancelled = () => new Error('Upload cancelled.');
    if (signal && signal.aborted) throw cancelled();

    // Same file (path + size + mtime) AND same metadata -- the title and the
    // rest are fixed when a session starts, so resuming a session made for
    // different metadata would silently publish the old title.
    const fingerprint = { filePath, size: totalSize, mtimeMs: stat.mtimeMs, metadata: JSON.stringify(metadata) };
    let sessionUrl = '';
    let offset = 0;
    let resumed = false;

    const saved = this.loadUploadSession();
    if (
      saved &&
      saved.sessionUrl &&
      saved.filePath === fingerprint.filePath &&
      saved.size === fingerprint.size &&
      saved.mtimeMs === fingerprint.mtimeMs &&
      saved.metadata === fingerprint.metadata
    ) {
      // Ask where YouTube's own copy stands -- a zero-length PUT with an
      // open-ended range is the protocol's "how much do you have?" query.
      try {
        const probe = await fetch(saved.sessionUrl, {
          method: 'PUT',
          headers: { 'Content-Length': '0', 'Content-Range': `bytes */${totalSize}` },
          signal,
        });
        if (probe.status === 200 || probe.status === 201) {
          this.saveUploadSession(null);
          const video = await probe.json();
          return { videoId: video.id, url: `https://youtu.be/${video.id}`, resumed: true };
        }
        if (probe.status === 308) {
          const range = probe.headers.get('range'); // "bytes=0-N", absent if nothing was received
          const last = range ? Number(range.split('-')[1]) : -1;
          sessionUrl = saved.sessionUrl;
          offset = Number.isFinite(last) ? last + 1 : 0;
          resumed = true;
        }
        // Anything else (404/410: the session expired) falls through to a fresh start.
      } catch (err) {
        if (signal && signal.aborted) throw cancelled();
        // Network trouble on the probe itself -- safest is a fresh start.
      }
    }

    if (!sessionUrl) {
      const startRes = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(totalSize),
        },
        body: JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description, categoryId: metadata.categoryId },
          status: { privacyStatus: metadata.privacyStatus, selfDeclaredMadeForKids: metadata.selfDeclaredMadeForKids },
        }),
        signal,
      });
      if (!startRes.ok) {
        const data = await startRes.json().catch(() => ({}));
        throw new Error(googleErrorMessage(data, `Starting the YouTube upload failed (${startRes.status}).`));
      }
      sessionUrl = startRes.headers.get('location');
      if (!sessionUrl) throw new Error('YouTube did not return an upload session -- try again.');
      this.saveUploadSession({ sessionUrl, ...fingerprint });
    }

    if (resumed && onProgress) onProgress(offset / totalSize);

    const fd = fs.openSync(filePath, 'r');
    try {
      let lastError = null;
      while (offset < totalSize) {
        if (signal && signal.aborted) throw cancelled();
        const chunkLen = Math.min(CHUNK_SIZE, totalSize - offset);
        const buffer = Buffer.alloc(chunkLen);
        fs.readSync(fd, buffer, 0, chunkLen, offset);

        let attempt = 0;
        for (;;) {
          try {
            const putRes = await fetch(sessionUrl, {
              method: 'PUT',
              headers: {
                'Content-Length': String(chunkLen),
                'Content-Range': `bytes ${offset}-${offset + chunkLen - 1}/${totalSize}`,
              },
              body: buffer,
              signal,
            });
            if (putRes.status === 308) break; // this chunk accepted, more to come
            if (putRes.status === 200 || putRes.status === 201) {
              const video = await putRes.json();
              this.saveUploadSession(null);
              return { videoId: video.id, url: `https://youtu.be/${video.id}`, resumed };
            }
            if (putRes.status === 404 || putRes.status === 410) {
              // The session is gone for good -- retrying the same URL can't
              // help, and keeping it would make the next run try it again.
              this.saveUploadSession(null);
              throw new Error('YouTube no longer has this upload session -- the next run will start it over.');
            }
            const data = await putRes.json().catch(() => ({}));
            lastError = new Error(googleErrorMessage(data, `Upload chunk failed (${putRes.status}).`));
          } catch (err) {
            if (signal && signal.aborted) throw cancelled();
            if (err && /no longer has this upload session/.test(err.message)) throw err;
            lastError = err; // network error mid-chunk -- retry the same chunk, not the whole upload
          }
          attempt += 1;
          if (attempt >= 5) throw lastError || new Error('Upload chunk failed repeatedly.');
          await sleep(Math.min(30_000, 1000 * 2 ** attempt), signal);
          if (signal && signal.aborted) throw cancelled();
        }

        offset += chunkLen;
        if (onProgress) onProgress(offset / totalSize);
      }
      throw new Error('Upload loop ended without YouTube confirming the video -- this should not happen.');
    } finally {
      fs.closeSync(fd);
    }
  }

}

function googleErrorMessage(data, fallback) {
  return (data && data.error_description) || (data && data.error && data.error.message) || (typeof data?.error === 'string' ? data.error : '') || fallback;
}

// Resolves early (not rejects) once `signal` aborts, so a retry backoff
// doesn't keep a cancelled upload waiting up to 30 seconds -- the caller
// checks signal.aborted right after.
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal && signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    }
  });
}

module.exports = { YouTubeUploader };
