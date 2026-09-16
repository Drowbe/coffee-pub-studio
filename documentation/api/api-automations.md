# Automations API

**Audience:** anyone writing a Foundry module (or anything else) that reports events to Coffee
Pub Studio, or driving Studio's manual OBS remote directly.

Studio runs a small local HTTPS server that a Foundry module -- Coffee Pub Herald first -- calls
to report an event (combat starting, a scene changing), which a user-configured rule on Studio's
Automations tab turns into an OBS action. See
[Automations architecture](../architecture/architecture-automations.md) for how the server itself
is built.

## Where it runs

Foundry usually runs on a different machine than Studio, so the server listens on every network
interface Studio's Mac has, not just localhost, and is reachable at
`https://<studio-host>:<port>` -- the address and port are shown on Studio's Session tab, under
Automations, once it is enabled. The port defaults to 9500 and is configurable there.

Every request needs a Bearer token, generated and shown in the same place. There is no
unauthenticated route except `GET /ca.crt`, described below.

## HTTPS, not HTTP

Foundry is commonly served over HTTPS itself, and a browser flatly blocks an HTTPS page from
making a plain-HTTP request at all ("mixed content"); no CORS header gets around it. Studio runs
its own small local Certificate Authority for this: a root generated once and reused, which signs
the server's actual certificate. The server only ever presents that signed certificate, never the
CA's private key.

A browser calling this API for the first time needs to trust that certificate once, in one of two
ways -- both are click-by-click in Studio's own Automations settings card, not repeated here since
they change as the UI does:

- Open the server's address directly in the browser once and click through the warning. Quick, but
  tied to that one browser and to the current certificate -- it stops working the moment Studio's
  Mac address changes and the certificate is regenerated to match.
- Install the CA's certificate (`GET /ca.crt`, unauthenticated -- a CA's public certificate is not
  a secret, only its private key is, which never leaves Studio's Mac) into the calling machine's
  trust store once. Every certificate this CA ever issues is trusted after that, in every browser
  on that machine, permanently.

Neither step is needed when the calling code runs inside one of Studio's own windows: Studio
recognizes its own certificate for its own webContents and trusts it automatically. See
[Automations architecture](../architecture/architecture-automations.md) for why that case needs
no manual step at all.

## POST /api/automations/event

Reports that something happened.

```
POST https://<studio-host>:<port>/api/automations/event
Authorization: Bearer <token>
Content-Type: application/json

{"event": "combat:start", "data": {"sceneId": "..."}}
```

- `event` (string, required) is matched against a rule's Event field exactly, case-sensitive, no
  wildcards. Studio does not interpret the string beyond comparing it, so the vocabulary
  (`combat:start`, `combat:end`, `scene:change`, and so on) is decided and documented on the
  calling module's side.
- `data` (object, optional) is shown back in Studio's Recent Events log for a human to read. No
  action currently reads any field from it; sending whatever is cheaply available (a scene name, a
  combat id) costs nothing and may be used by a future rule type.
- The response is always JSON: `{"ok": true}` on success, `{"error": "..."}` with a 400 (bad
  request), 401 (missing or wrong token), or 404 (wrong path or method) otherwise.
- A 200 means Studio accepted and logged the event, not that a rule's OBS action succeeded. The
  matched rule (if any) runs afterward and independently; a rule that fails (OBS not connected, a
  scene that does not exist) is logged on Studio's side and does not change this response.
- The body is capped at 16 KB and must be valid JSON with a string `event` field, or the request
  is rejected before anything is recorded.

## GET /api/automations/ping

Same auth as the event endpoint. Returns `{"ok": true}`. A cheap way to check the token and the
connection alone, without reporting an event.

## GET /api/automations/capabilities

Same auth. Returns what Studio can actually do right now, so a caller does not have to hardcode
or guess either:

```json
{
  "actions": [
    { "action": "sceneSwitch", "param": "scene name" },
    { "action": "sourceShow", "param": "source name" },
    { "action": "startRecording", "param": null }
  ],
  "rules": [
    { "event": "combat:start", "action": "sceneSwitch", "param": "Combat" }
  ]
}
```

`actions` is the fixed vocabulary of OBS actions a rule can trigger -- see the table below.
`rules` is whatever is actually configured on the Automations tab right now: the real, current
event-name-to-action mapping. Useful for validating that an event name is wired to something
before sending it, or for building a settings UI around Studio's real configuration instead of a
copied assumption.

## GET /ca.crt

Unauthenticated. Downloads the CA's certificate (`coffee-pub-studio-ca.crt`), described above
under HTTPS.

## Actions a rule can trigger

| Action | What it does | `param` |
| --- | --- | --- |
| `sceneSwitch` | Switches OBS to the named scene | the exact scene name |
| `sourceShow` | Makes a source visible in every scene it is used in | the exact OBS source name |
| `sourceHide` | Hides a source in every scene it is used in | the exact OBS source name |
| `startRecording` | Starts OBS recording | not used |
| `stopRecording` | Stops OBS recording | not used |
| `startStreaming` | Starts OBS streaming | not used |
| `stopStreaming` | Stops OBS streaming | not used |

All seven reuse the same OBS WebSocket connection Studio already keeps for everything else; there
is no separate connection or credential for Automations to reach OBS.

## Example: reporting combat start

This is a suggested starting point, not a contract Studio enforces -- the actual hook names and
timing are the calling module's call, and worth confirming against a live client the same way any
Foundry hook usage should be, since a hook that silently does not fire in a given version fails
quiet, not loud.

Coffee Pub Herald already depends on Coffee Pub Blacksmith and its HookManager (see Blacksmith's
own `api-hookmanager` page), so registering through that is a natural fit, alongside two settings
for Studio's address and token:

```javascript
BlacksmithHookManager.registerHook({
  name: 'combatStart',
  description: 'Tell Coffee Pub Studio combat has started',
  context: 'herald-automations',
  callback: async (combat) => {
    const url = game.settings.get('coffee-pub-herald', 'studioAutomationsUrl'); // e.g. https://10.0.0.5:9500
    const token = game.settings.get('coffee-pub-herald', 'studioAutomationsToken');
    if (!url || !token) return;
    try {
      await fetch(`${url}/api/automations/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event: 'combat:start', data: { combatId: combat.id, sceneId: combat.scene?.id } }),
      });
    } catch (err) {
      console.warn('Herald | Could not reach Coffee Pub Studio', err);
    }
  },
});
```

Fire-and-forget is deliberate: a game should never stall or throw because Studio is unreachable,
and the 16 KB/JSON-shape check on Studio's side means a malformed or oversized body just gets a
400 rather than doing anything unexpected. `deleteCombat` is the natural pair for a `combat:end`
event; `canvasReady` fires on every scene change (`data: {sceneId: canvas.scene?.id}`) for a
`scene:change` event. None of the three are specific to Herald -- any module could report them
the same way.
