# Command Matrix — website

This is the static website for Command Matrix, published with GitHub Pages.
It contains only public HTML, CSS, JavaScript, images and rule tables. It has no
database, passwords or server credentials. The game server runs separately on the
host's PC and is not part of this repository.

The website connects to the backend address in `config.js`. Accounts, games, ship
designs and saved state all live on that server. The website keeps only your sign-in
session token, in the browser tab's `sessionStorage`.

## Playing

1. Sign in with the player name and password your host gave you. There is no
   self sign-up; ask the host if you need an account or a password reset.
2. Create a game, or join one with the eight-character code from your host.
3. Choose ships from the host's ship library and add them to your fleet. Ships
   cannot be uploaded from the website; ask the host to add new designs.
4. Everyone marks ready, then the host starts the game.

Select your own ship to open **Veil**, your private station. Energy allocation, turn
controls and move-chart highlights save automatically, and only you can see them.
Select another player's ship to open **StarHold**, the shared view. Only the host
assigns damage, and it updates the owner's Veil.

Veil's **Set weapon status** control initializes phaser capacitors before locking
turn 1. **Option mount power** opens the power-record setup. Both are private to
the ship's owner.

Use **Save now** before closing the tab. If another window changed the same ship,
use **Reload ship** to discard local edits and load the saved version.

If the page shows **Server offline**, the host's game server or tunnel is not
running. The page retries automatically.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `app.js`, `site.css` | The website shell: sign-in, lobby and fleet. |
| `config.js` | Public backend address. Never put secrets here. |
| `native/station.js` | Mounts the Veil and StarHold stations with scoped styles. |
| `native/generated/` | Pre-built station modules. No build step is needed to host. |
| `views/` | Source copies of the original Veil and StarHold code, and the adapters that add multiplayer behavior. |
| `assets/` | Rule tables (rolls and shipyard data). |

All links are relative, so the site works from a repository Pages URL. Open it over
HTTP, not as a `file://` page; browser modules and the server's origin check need HTTP.
