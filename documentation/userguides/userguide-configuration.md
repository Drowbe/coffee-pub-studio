# Configuration file reference

**Audience:** anyone reading or editing Coffee Pub Studio's config.json directly, or scripting
against it.

Settings are stored as JSON at
`~/Library/Application Support/Coffee Pub Studio/config.json` (the control panel's
**Show config file** button reveals it in Finder).

This example is trimmed to the window/OBS shape for readability; `tavern` and `automations` are
separate top-level sections, covered in their own guides:
[Coffee Pub Tavern in OBS](userguide-tavern.md) and the
[Automations API](../api/api-automations.md).

```json
{
  "version": 12,
  "obs": { "autoConnect": false, "host": "127.0.0.1", "port": 4455 },
  "views": [
    {
      "id": "window1",
      "label": "Game",
      "url": "https://your-server.example/game",
      "width": 1920,
      "height": 1080,
      "x": null,
      "y": null,
      "muted": false,
      "enabled": true,
      "session": "Main",
      "windowSource": { "enabled": true, "name": "Window: Game (CP Studio)" },
      "regions": []
    },
    {
      "id": "window2",
      "label": "Stream",
      "url": "https://your-server.example/stream",
      "width": 1920,
      "height": 1080,
      "x": null,
      "y": null,
      "muted": true,
      "enabled": true,
      "session": "Main",
      "windowSource": { "enabled": false, "name": "Window: Stream (CP Studio)" },
      "regions": [
        {
          "id": "region1",
          "name": "Scoreboard",
          "mode": "selector",
          "selector": "#scoreboard",
          "x": 0,
          "y": 0,
          "width": 600,
          "height": 200,
          "obsSource": "Region: Stream>Scoreboard (CP Studio)"
        }
      ]
    }
  ]
}
```

`views` holds zero to five entries, in the order they appear in the panel and in the menu.

| Field | Meaning |
| --- | --- |
| `panel` | Where the control panel was last left (`x`, `y`, `width`, `height`), written by the app; `null` lets macOS place it. |
| `menuBarIcon`, `hideDockIcon` | Show the menu bar icon; optionally hide the Dock icon while it is shown. |
| `retinaDouble` | On a Retina display OBS captures twice the pixels of a window's size. `false` (default): the app scales its window and region sources by half in OBS so they land at the sizes set here. `true`: it keeps the double pixels (**Retina display: double the pixel dimensions**). A scale you set by hand on a source in OBS is left alone. |
| `wakeAudioDelay` | Seconds after a page loads before its audio is woken (**Wake audio after** on the Session tab, 10 to 300, default 30). Foundry ignores clicks until it has fully loaded, which can take longer than the page says. |
| `dock` | The edge dock: `enabled`, `side` (`right` or `left`) and `overlap`, the points of a docked window left on screen (0 slides it fully off). It lives on the display chosen for auto-arrange. |
| `obs` | OBS WebSocket connection: `autoConnect`, `host`, `port`. The password lives in `obs-secret.bin` next to the config, encrypted. |
| `tavern` | Coffee Pub Tavern: `enabled`, `url`, `login`, `autoConnect`, the Participant source's `playerWidth`, `playerHeight`, `lockRatio` (still `player`-prefixed in the field names and in `players` below, kept for back-compat with existing config files and the Tavern's own `kind=player` view-link parameter); the Character source's `characterWidth`, `characterHeight`, `characterWithPlayer`; `room`, the Tavern room whose users the CP Tavern tab lists by hand (`lobby` by default); `followAdmin` (default `true`), which overrides `room` with whatever room the signed-in admin is actually in at the table and hides a published user's OBS sources while they are off it; and `players`, a map from the user's Tavern key to `{ player, character, source, characterSource }` (the two ticks, and the OBS source names while published). The password lives in `tavern-secret.bin`. |
| `label` | Shown in the window title, so it is also the name OBS lists. |
| `url` | Page to load. Must be `http` or `https`; empty shows a placeholder. |
| `width`, `height` | Content size in points (100 to 7680). |
| `x`, `y` | Window position, written by the app when you move the window; `null` lets macOS place it. |
| `windowSource` | The whole window as one OBS source: `enabled` (off hides it in OBS and stops maintenance) and `name`, the OBS source name. |
| `regions` | Named parts of the window. `mode` is `rect` or `selector`; `x`, `y`, `width`, `height` are in window points and are re-measured from `selector` when set; `obsSource` names the cropped OBS source the app maintains; `enabled` false hides it in OBS and stops maintenance. |
| `muted` | Mute the window's audio. Handy for a chat-facing window so its sounds are not doubled. |
| `enabled` | Open this window when the app launches (**Start on launch**). |
| `dockOnLaunch` | Slide the window into the dock as soon as its page has loaded at launch (**Dock on launch**). |
| `wakeAudio` | Send the page a middle-button click after the **Wake audio after** delay, so Foundry can start its audio (**Wake audio after load**, on by default). Browsers keep a page silent until someone interacts with it, and Foundry ignores clicks until it is fully set up; after the delay the app clicks, and keeps clicking every few seconds while Foundry still says its audio is locked, for up to three minutes. The **Wake audio** button on the card and on the dock does the same on demand, and the **Page audio** row says whether the page is making sound right now. |
| `session` | Session group name (default `Main`). Windows with the same name share cookies and storage. |
