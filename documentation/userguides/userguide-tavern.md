# Coffee Pub Tavern in OBS

**Audience:** anyone using Coffee Pub Tavern to publish players into OBS through Studio.

[Coffee Pub Tavern](https://github.com/Drowbe/coffee-pub-tavern) is the party's voice and video
server. Studio signs in to it as an admin and gives every player their own OBS Browser Source.

## Sign in

On the Session tab, in **CP Tavern**, tick **Enable Coffee Pub Tavern** (the CP Tavern tab only
shows while it is on), then enter the server address (for example `https://tavern.example.com`),
your admin login and password, click **Save password**, then **Sign in**. Tick **Sign in
automatically** to reconnect at every launch.

The password is stored encrypted with the macOS keychain, like the OBS password. The stream key
the sources use is fetched from the server at sign-in and never has to be copied.

If the account has two-step sign-in turned on (or the server requires it for everyone), a
**Two-step code** field appears after **Sign in** -- enter the six-digit code from your
authenticator app and click **Verify**, or **Cancel** to back out. Studio remembers that it
verified for 30 days, so it isn't asked again until then. If the account hasn't set up two-step
sign-in yet, Studio can't do that part -- sign in once in a browser to set it up, then come back
and sign in here as usual.

## Source sizes

The **Participant source** is their video, or a still image when the camera is off, with the
talking border, overlays and name plate set on the Tavern. Set its width and height, with
**Constrain proportions** keeping them at 16:9. Audio is always included; the source's own
**Control audio via OBS** in OBS decides whether it reaches the mixer. The **Character source** is
the character image with the talking and muted images on top, transparent until they talk or mute
when there is no character image, made for overlaying a character bar. Set its size;
**New users get Character on by default** decides the starting tick for anyone you haven't set by
hand.

## The CP Tavern tab

Every account on the server is listed with a green dot while they are at the table, their
microphone and camera state, and which room they're actually in right now. **Participants** and
**Characters** are two separate sections, each listing whoever the current room offers that kind
to -- a room whose profile excludes one of them (Participants only, say) simply doesn't show that
section. Each row has its own **Show in OBS** / **Hide in OBS** toggle -- hiding never deletes the
source, so any position, scale or filter you set on it in OBS survives -- and, once it exists, a
**Delete from OBS** button that actually removes it. OBS names follow one pattern everywhere:
`Participant: <name> (CP Studio)` and `Character: <name> (CP Studio)`.

The bulk buttons above the list act on the whole room at once: **Show All in OBS** / **Hide All in
OBS** only touch visibility, never creating or deleting anything; **Add All in OBS** creates a
source for everyone ticked but not there yet; **Delete All from OBS** removes every Tavern source
outright.

**Sync OBS** re-points every source at its current link and size and follows renames; the app
also does this whenever OBS connects or the Tavern reports a change. The link button on a row puts
its OBS view link on the clipboard for a source you manage yourself. Users are tracked by the
Tavern's stable key, so renaming someone on the Tavern renames both OBS sources without breaking
anything. Muting and kicking players is done on the Tavern's manage page, which **Manage users**
opens in your browser, along with passwords, links, images and rooms.

## Rooms and Asides

The **Room** card at the top of the CP Tavern tab picks which room's users are listed: the
**Lobby** holds everyone, and the rooms an admin curates on the Tavern's Rooms tab hold the users
they picked. This is always a manual pick -- "this room is for this OBS session" -- and is never
overridden by wherever the admin happens to be live; a room whose profile restricts which source
kinds it offers (Participants only, say) gates what's published here too. **Publish all**
publishes the chosen room's users.

**Enable Asides**, on by default, mutes anyone whose OBS source is live in a different room than
wherever the signed-in admin actually is right now (including a pull-aside room), so a private
conversation elsewhere doesn't bleed into the stream's audio -- the source itself stays visible
either way, and this only ever mutes, it never changes which room is shown above. It only takes
effect while an admin is actually online; with none online there's no "current conversation" to be
aside from. Someone offline is never muted by this setting -- there is no live audio to mute in
the first place. None of this is visual: any dim or tint for someone offline or aside is rendered
by the Tavern server's own page, not by Studio.
