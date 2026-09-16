# Known Issues

**Audience:** anyone using Coffee Pub Studio who wants to know what is broken before reporting
it as new.

A defect is recorded here once it is confirmed -- either by watching it happen, or, for a gap this
unambiguous, by a plain reading of the code -- with a workaround if one exists, and moves to the
CHANGELOG once fixed.

## OBS sources are not managed automatically on Windows

Studio's OBS integration creates and maintains capture sources using OBS's `screen_capture` input
kind, which is macOS-only (`src/obs.js`). Windows OBS uses a different input kind,
`window_capture`, identified by a `Title:Class:Exe` string rather than a numeric window ID, so the
same code does not carry over.

The app itself builds, installs and runs on Windows -- windows open, OBS connects over its
WebSocket server, and Coffee Pub Tavern sources work normally, since those don't depend on the
window-capture input kind. Only the "whole window" and region OBS sources are affected.

Workaround: on Windows, add each window as an OBS source by hand (OBS's **+** under Sources,
**Windows Capture (Win32)**, pick the window by its Studio-set title) instead of using Studio's
**Add to OBS** button, and re-pick it yourself if OBS ever loses track of the window.
