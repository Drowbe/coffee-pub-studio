# Getting Started with Coffee Pub Studio

**Audience:** anyone who has just installed Coffee Pub Studio and wants to see it working.

## Install it and open it

Download the disk image from the repository's Releases page, drag Coffee Pub Studio into
Applications, and open it. The first time, macOS blocks an unsigned build; right-click the app
and choose Open, then Open again in the dialog that follows.

## What happens the moment it opens

A control panel opens, with no windows configured yet. Studio wraps any web page in a
borderless, fixed-size Chromium window with a thin bar of its own at the top for dragging and
resizing; it is optimized for running FoundryVTT sessions but works with any web-based
experience. The rest of this guide uses a two-window FoundryVTT setup as the running example,
since that is the most common case, but any page works the same way.

## Add a window and point it at your game

Click the **+** tab to add a window (up to five), give it a label such as Game, and set its
address to your Foundry game's URL. Add a second one labeled Stream if you use a stream-facing
view. Log in to Foundry once, in the Game window; every window sharing the default session group
uses that same login, so you do not log in twice.

## Set the size OBS will capture

Set each window's Width and Height on its card to the exact pixel size you want in OBS. Changes
apply immediately to an open window and save on their own -- there is no separate save action to
remember.

## Bring it into OBS

Connect Studio to OBS from the Session tab's OBS card (OBS's own WebSocket server has to be
turned on first, from OBS's Tools menu). Once connected, Studio creates and points OBS sources at
your windows on its own, cropping out Studio's own bar so OBS only ever sees the page underneath
it.

## Where to go from here

That covers watching your own game render and land in OBS. Coffee Pub Tavern (publishing the
party as their own OBS sources) and Automations (letting a Foundry module drive OBS) are both
covered on their own pages once written; until then, the repository README's "Using it" section
walks through every other part of the control panel in more depth.
