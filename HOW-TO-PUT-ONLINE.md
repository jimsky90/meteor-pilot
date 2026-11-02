# Meteor Pilot: installable app

This folder is the complete game as an installable app. Players open a web address, tap **Install** (or "Add to Home Screen"), and Meteor Pilot gets its own icon. It opens full screen and works offline.

It needs its own web address. The claude.ai link can't be installed, because it runs inside Claude's page.

## Put it online (free, about 5 minutes)

Pick one:

**Netlify (easiest, no code)**
1. Go to app.netlify.com/drop.
2. Drag this whole folder onto the page.
3. Create a free account when asked, so the site stays online.
4. You get an address like `comet-run-123.netlify.app`. You can rename it in Site settings.

**Cloudflare Pages**
1. Sign up free at dash.cloudflare.com.
2. Go to Workers & Pages, then Create, then Pages, then Upload assets.
3. Upload this folder.

**GitHub Pages**
1. Make a new public repository and upload these files.
2. Go to Settings, then Pages, and choose "Deploy from branch", main, / (root).

All three give you HTTPS. Installing only works on an HTTPS address.

## How players install it

- **Android (Chrome):** open the address and tap the teal **Install** button at the top of the game, or use Chrome's menu and choose "Install app".
- **iPhone (Safari):** open the address, tap Share, then **Add to Home Screen**.
- **Computer (Chrome or Edge):** click the install icon in the address bar.

## Updating the game later

1. Replace `index.html` with the new version.
2. In `sw.js`, change `VERSION` (for example `meteor-pilot-v18` to `meteor-pilot-v19`).
3. Upload the folder again.

Players get the update the next time they open the app while online.

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The game (version 17) plus the install button |
| `manifest.webmanifest` | App name, icon, colors and full-screen setting |
| `sw.js` | Offline support: saves the game on the phone after the first visit |
| `icons/` | App icons for Android, iPhone and the browser tab |

Progress is saved on each player's device. It isn't shared between devices yet, because that needs accounts and a server.

The Shop's paid items stay in test mode, with no charges, until the game ships on Google Play or the App Store with real billing.
