# Known Issues

**Audience:** anyone using Coffee Pub Studio who wants to know what is broken before reporting
it as new.

A defect is recorded here once it is confirmed -- either by watching it happen, or, for a gap this
unambiguous, by a plain reading of the code -- with a workaround if one exists, and moves to the
CHANGELOG once fixed.

## Windows OBS source management is new and unconfirmed

On macOS, Studio creates and maintains capture sources with OBS's `screen_capture` input and
points each at a window by its numeric system ID. Windows OBS has a different input kind,
`window_capture`, which identifies a window by a `Title:Class:Executable` string. Studio now asks
OBS which platform it is running on and uses the matching one: the same flow (list the windows OBS
offers, match by title, point the source, crop, scale, mute) with that input kind and that kind of
window value. The macOS behavior is unchanged.

This has been built against OBS's documented behavior and tested against a stand-in for OBS, but
**not yet on a real Windows machine**, so treat it as unconfirmed until it has been. Two things in
particular need a real check, and the **Copy capture report** button on the OBS card (Configuration
tab) exists to settle them in one go:

- What OBS actually returns for the window list on Windows (the label and value formats Studio's
  matching depends on).
- That a source set to "window title must match" really does capture nothing, rather than a
  different Studio window, when its own window is closed. Every Studio window shares one
  executable and one window class, so any looser matching could show the wrong window.

Also not yet addressed on Windows: display scaling. Studio's size readout and the "scaled back
down" correction assume the capture is the window's size times the display's scale factor, which is
how a Retina display behaves on macOS; whether Windows display scaling behaves the same way is part
of what the report records.

If a source ends up pointing at the wrong window or none, the by-hand route still works: in OBS
add a **Window Capture** source under Sources, pick the window by its Studio-set title, and
re-pick it yourself if OBS ever loses track of it. Attach the capture report to any report of this.
