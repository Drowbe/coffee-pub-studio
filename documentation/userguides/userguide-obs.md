# Windows and regions as OBS sources

**Audience:** anyone connecting Coffee Pub Studio's windows to OBS as capture sources.

## Add windows to OBS by hand

The easy way is the OBS connection described below: the app creates the sources and keeps them
cropped and pointed at the windows. By hand:

1. In OBS, click **+** under Sources and choose **macOS Screen Capture**.
2. Set **Method** to **Window Capture** and pick the window you want, by the label you gave it in
   Studio, from the **Window** list. Turn off **Show Cursor** if you do not want the pointer
   recorded.
3. Crop the top of the source by the height of the app's bar (28 px, or 56 px on a Retina
   display) so the bar is not recorded: right-click the source, Transform, Edit Transform, and set
   the top crop. Sources the app creates get this crop by themselves.
4. Repeat for every other window.
5. The first time, macOS asks to give OBS **Screen Recording** permission (System Settings >
   Privacy & Security > Screen Recording). Restart OBS after granting it.

The windows can sit behind other windows, but they must not be minimized (the app disables
minimizing) and they must be on a connected display.

## Let the app manage the OBS sources

macOS gives every window a new ID each time an app launches, and an OBS window-capture source
remembers that ID. That is why a source can come up empty after you restart the app until you
re-pick the window. The app fixes this by talking to OBS over its built-in WebSocket server.

1. In OBS, open **Tools > WebSocket Server Settings**, enable the server and set a password.
   Leave the port at 4455.
2. In the **OBS** section of the Session tab, enter the password, click **Save password**, then
   **Connect**. The tab shows CONNECTED once it has connected. Tick **Connect automatically** to
   connect at launch and reconnect whenever the link drops; **Disconnect** pauses that until you
   connect again.
3. On every connection and every time one of the app's windows starts, the app points each of its
   OBS sources at the window's current ID and keeps a `Coffee Pub Crop` filter on it that removes
   the app's bar.

The OBS WebSocket password is stored encrypted with the macOS keychain, separate from the config
file. The app and OBS have to run on the same Mac, since OBS can only capture windows on its own
machine.

## The whole window as an OBS source

Under each window's card sits a **Whole window** card: a switch, the OBS source name, and the
source's state in OBS. Type any name you like (it starts as `Window: <label> (CP Studio)`) and
click **Add to OBS** to create a window-capture source with that name in the current scene. A
source that already exists in OBS under that name, or one you made by hand that already captures
the window, is simply taken over; typing a new name renames it in OBS too. **Delete from OBS**
deletes the source but keeps the name, so you can add it again later.

Switch the card off for a window you only use through regions: the source is hidden in OBS and no
longer maintained until you switch it back on.

## Regions: part of a window as its own OBS source

If a window shows several things you want as separate OBS sources, for example a scoreboard and a
status panel pinned inside a view, define a **region** for each.

1. With the window started, click **Add region** on its tab. A region card appears with a name,
   an enabled checkbox, and its settings. Changes save as you type.
2. Click **Draw the region** and drag a rectangle on the snapshot of the page, or type X, Y,
   Width and Height in page points.
3. For an element your own module renders, pick **CSS selector** instead, enter the selector (for
   example `#scoreboard`, or a plain list of class names) and click **Measure**. The app reads the
   element's position from the page, and re-measures it on every OBS sync so the crop follows the
   element.
4. Click **Add to OBS**. The app adds a window-capture source named after the window and region,
   such as `Region: Stream>Scoreboard (CP Studio)`, with a **Crop/Pad** filter called
   `Coffee Pub Crop` that isolates the region. Drop that source into any scene.

While connected, the app knows whether each source still exists in OBS. A region whose source you
deleted in OBS offers **Add to OBS** again, which re-creates it under the same name; **Delete from
OBS** deletes the source from OBS. The checkbox in front of a region disables it: the app stops
maintaining it and hides it in every OBS scene until you enable it again. **Delete** removes the
region itself.

On every sync the app re-points the region's source at the window and updates the crop values,
including the Retina factor, so resizing the window or editing the region keeps the OBS source
correct. Removing a region in the app leaves the source in OBS; delete it there if you no longer
need it. Only elements that stay in a fixed place work well; a chat message that scrolls away
cannot be followed by a crop.

## App windows: capturing another application

An **app window** captures a window that belongs to a different application (a game, Discord, a browser you run yourself) into OBS, and keeps it pointed at that
window as the app reopens. Studio doesn't own these windows: it can't open, move, dock or mute
them, and it leaves their audio alone.

Add one with the **+** tab, the same as a web window: it asks whether you want a **Web window** or an
**App window**. Each app window then gets a tab of its own.

1. Connect the app to OBS. OBS has to be connected, and it needs at least one window source already
   (any of Studio's own will do), because that's where OBS lists windows from.
2. On the new app window's tab, click the refresh button beside the picker and choose the window.
   This fills in the **App** and **Title contains** fields.
3. Clear **Title contains** if the window's title changes (a document name, a browser tab) and you
   want any window of that app. Both fields are case-insensitive substring matches. If several
   windows match, the first one OBS lists wins, so narrow it with the title.
4. Click **Add to OBS**. The source is named `App: <label> (CP Studio)`; edit the **OBS source**
   field to rename it (the OBS source is renamed too).

The tab's header shows whether the window is currently found, and its dot goes green when it is. The app looks it up again on every sync, so a
relaunched app is picked up automatically. If the window isn't open, the source is left as it was.
**Cropping and the cursor.** OBS has no "hide title bar" option on macOS; a crop is the only way, so
each app window has **Crop (pixels)** fields for Left, Top, Right and Bottom (captured pixels, which
is twice the point size on a Retina display). **Trim title bar** fills in Top with a standard 28-point
title bar for this display; adjust it by eye, since windows with a toolbar built into the title bar
(and some apps that draw their own) need a different number. A crop of all zeros leaves the source
uncropped. **Show cursor** controls whether the mouse pointer appears in the capture (off by default).
The capture method stays on OBS's Window Capture; Display and Application Capture aren't offered.
Cropping part of a window into separate sources (regions) isn't available for app windows yet, and
this is macOS only for now.

## Troubleshooting

- **OBS shows a black or frozen source.** Make sure OBS has Screen Recording permission and that
  the window is on a connected display and not hidden with Cmd+H. If it happens after restarting
  the app, connect the app to OBS as described above so the source is re-pointed automatically, or
  open the source's properties and pick the window again.
- **The OBS section says the password was rejected or OBS is not running.** Check Tools >
  WebSocket Server Settings in OBS: the server must be enabled and the password must match.
