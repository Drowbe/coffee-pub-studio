# Settings, windows and the edge dock

**Audience:** anyone setting up windows, the edge dock, keyboard shortcuts, or Retina display
handling in Coffee Pub Studio.

## The control panel

The control panel has a **Session** tab (layout, the edge dock, OBS connection and login), a
**CP Tavern** tab when Coffee Pub Tavern is enabled, and one tab per window with its whole-window
source and its regions; every window's own tab has a **Delete window** button. Reopen the panel
with **Cmd+0** or by clicking the Dock icon after closing it -- the app keeps running in the
background so OBS keeps its sources. Quit with **Cmd+Q**.

## Adding a window

Click the **+** tab to add a window (up to five), give it a label and a URL. A new window starts
with no URL and shows a placeholder until you enter one. Each window is listed in OBS by its
label, so give every window a different label.

If you are running FoundryVTT, log into it in whichever window you use to follow the game, as the
user you want the recording to follow (a dedicated observer user works well). Windows in the same
**Session group** share that login; give a window a different group name to give it its own
cookies, for a different login or a different site entirely. Any number of windows can share a
group. The change applies the next time the window starts.

## Size and position

Set each window's **Width** and **Height** to the exact size you want; changes apply live to open
windows and are saved automatically. The **Start** button on each card opens its window and turns
into **Stop**; an ACTIVE tag shows while the window is open. **Reset window** centers it on its
display and brings it to the front.

Move a window by dragging the **bar** at its top. Click the bar and use the arrow keys to resize
the page: Right/Left change the width and Down/Up change the height by 1 px, or 10 px with Shift.
The bar shows the current position and page size. Double-click it to focus the page for typing.
**Auto-arrange on display** lays the windows out left to right from the top-left corner of a
display, wrapping to a new row when they no longer fit.

## The edge dock

The edge dock is a small rounded pill on the right (or left) edge of the display chosen on the
Session tab, with a dot per window and a blinking red dot while OBS records. Hover it to expand
it: REC and LIVE timers, the current OBS scene, and one card per window with its state, OBS
source and a thumbnail taken when it was docked. Click a card to dock that window (slide it off
screen) or bring it back; **Dock Windows** and **Undock Windows** do it for every window, as does
Cmd+Shift+C.

A docked window keeps a 6 pt sliver on screen under a thin dark line, so OBS keeps capturing it,
whereas hiding or minimizing a window stops the capture. Windows dock on the display they are on,
toward an edge that has no other monitor beyond it (the dock's side when free, otherwise the
opposite side, then the bottom), so a docked window never slides onto another screen or changes
its captured size. Turn the dock off on the Session tab if you do not want it.

## The menu bar icon

The optional menu bar icon (Session tab) offers Start, Stop, Dock, Sync OBS and Quit, and can
hide the Dock icon so the app behaves like a utility.

## Retina displays

On a Retina display macOS renders 2 physical pixels per point, so a 1920 x 1080 window is
captured by OBS at 3840 x 2160. The control panel shows the exact **Captured pixels** for each
open window. The **Retina display: double the pixel dimensions** tick on the Session tab decides
what the app does about it. Unticked (the default), Sync OBS scales the window and region sources
it creates by half, so they land in the scene at the sizes set here. Ticked, it keeps the double
pixels for a sharper 4K canvas. A scale you set by hand on a source in OBS is left alone. On a
non-Retina display, or when the app windows sit on a non-Retina external monitor, the sizes match
1:1 and the tick makes no difference.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Cmd+0 | Show the control panel |
| Cmd+Shift+C | Dock all windows (slide them off screen), or undock them |
| Cmd+1 to Cmd+5 | Open (or focus) window 1 to 5 |
| Cmd+Shift+1 to Cmd+Shift+5 | Reload window 1 to 5 |
| Cmd+R | Reload the focused window |
| Alt+Cmd+I | Toggle developer tools for the focused window |
| Cmd+Q | Quit |

## Troubleshooting

- **A window shows a Chromium error page.** Check the URL on the window's tab and press
  **Reload**. The window must be able to reach the site you pointed it at.
- **Logged out unexpectedly.** Use **Sign out (clear cookies)** on that window's tab and log in
  again.
- **Audio/video chat permissions.** The app allows microphone, camera and notification permission
  requests only from the origins of the URLs you have configured.
