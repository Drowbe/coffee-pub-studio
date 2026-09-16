# Getting Started with Coffee Pub Studio

**Audience:** anyone who has just installed Coffee Pub Studio and wants to see it working.

## Install it and open it

Download the disk image from the repository's Releases page, drag Coffee Pub Studio into
Applications, and open it. The first time, macOS blocks an unsigned build; right-click the app
and choose Open, then Open again in the dialog that follows.

## What happens the moment it opens

A control panel opens, and so do the Game and Stream windows -- two borderless Chromium windows,
each with a thin bar of Studio's own at the top for dragging and resizing. Nothing is pointed at
Foundry yet; each window shows a placeholder until you give it a page.

## Point it at your game

In the control panel's Session tab, find the Game window's card and set its address to your
Foundry game's URL. Do the same for the Stream window if you use one. Log in to Foundry once, in
the Game window; every window sharing the default session group uses that same login, so you do
not log in twice.

## Set the size OBS will capture

Set each window's Width and Height on its card to the exact pixel size you want in OBS. Changes
apply immediately to an open window and save on their own -- there is no separate save action to
remember.

## Bring it into OBS

Connect Studio to OBS from the Session tab's OBS card (OBS's own WebSocket server has to be
turned on first, from OBS's Tools menu). Once connected, Studio creates and points OBS sources at
the Game and Stream windows on its own, cropping out Studio's own bar so OBS only ever sees the
Foundry page underneath it.

## Where to go from here

That covers watching your own game render and land in OBS. Coffee Pub Tavern (publishing the
party as their own OBS sources) and Automations (letting a Foundry module drive OBS) are both
covered on their own pages once written; until then, the repository README's "Using it" section
walks through every other part of the control panel in more depth.
