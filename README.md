# AFKbot 🤖 — v26.1

A lightweight AFK bot for Minecraft Java Edition with a neon cyberpunk dashboard.
No pathfinding, no combat, no mining — just wandering, eating, and occasional
block placement. Built to use as little CPU/RAM as possible so it runs cheaply
on Railway.

## What's inside

```
AFKbot/
  settings.json   <- all your settings live here
  package.json    <- list of code libraries it needs
  index.js        <- starts the dashboard + bot
  bot/
    bot.js        <- the bot's brain
  web/
    index.html    <- dashboard page
    style.css     <- cyberpunk styling
    script.js     <- dashboard logic
  README.md       <- this file
```

## Step-by-step setup (super simple version)

### Part 1: Put the code on GitHub

1. Go to **github.com** and log in (make an account if you don't have one).
2. Tap the **+** icon top right → **New repository**.
3. Name it `AFKbot` → tap **Create repository**.
4. On the new empty repo page, tap **uploading an existing file**.
5. Upload these 4 files first, exactly as named — do not rename them:
   - `README.md`
   - `settings.json`
   - `package.json`
   - `index.js`
6. Now upload `bot.js` — but before committing, tap the filename and change
   it to `bot/bot.js`. Typing the `/` tells GitHub to put it inside a new
   folder called `bot`.
7. Now upload `index.html`, `style.css`, and `script.js` the same way, one
   at a time, renaming each to:
   - `web/index.html`
   - `web/style.css`
   - `web/script.js`
8. Scroll down, tap **Commit changes**.

When you're done, your repo should show two folders (`bot` and `web`) plus
the 4 loose files (`README.md`, `settings.json`, `package.json`, `index.js`)
sitting at the top level.

### Part 2: Put your server info in the settings

1. In your GitHub repo, tap on `settings.json`.
2. Tap the pencil icon ✏️ to edit it.
3. Change `"serverIp": ""` to your server's address, like `"serverIp": "play.myserver.com"`.
4. Change `"serverPort": 25565` if your server uses a different port.
5. Leave `"username": "AFKbot"` as is (or change the name if you want).
6. Scroll down, tap **Commit changes**.

### Part 3: Launch it on Railway

1. Go to **railway.app** and sign up (you can use your GitHub account to log in).
2. Tap **New Project**.
3. Tap **Deploy from GitHub repo**.
4. Pick the `AFKbot` repo you just made.
5. Railway will read `package.json` and install everything by itself —
   just wait a minute or two.
6. When it's done, tap on your project, then find **Settings** → **Networking**.
7. Tap **Generate Domain**. Railway gives you a web address (like
   `afkbot-production.up.railway.app`).
8. Open that address in your phone browser — you'll see your neon dashboard,
   with the version number (v26.1) shown right next to the title. ✨

### Part 4: Start your Minecraft server first

If your Minecraft server is hosted somewhere like Aternos, it needs to
already be running and online before the bot can join. Start your server
first, wait until it shows "Online," and only then move to Part 5.

### Part 5: Turn the bot on

1. On the dashboard, tap the green **Connect** button.
2. Watch the status dot turn yellow (connecting) then green (online).
3. That's it — your bot is now in your Minecraft server, wandering around.

### Everyday buttons

- **Connect** — bot joins the server.
- **Reconnect** — disconnects and rejoins fresh (use this if it seems stuck).
- **Disconnect** — bot leaves the server on purpose (won't auto-rejoin until
  you tap Connect again).

### If you ever stop the Railway service

The dashboard page needs the bot's server to be running to load properly.
If you've stopped the service in Railway, a browser tab that's already open
will show **"Service Offline"** in the status banner instead of a blank or
broken page — refreshing the page itself may show a browser error until you
start the service again in Railway.

## Changing settings later

Anytime you want to change the server IP, port, username, or how often the
bot wanders/sprints/crouches/places blocks, just edit `settings.json` on
GitHub and commit — Railway will notice and redeploy automatically with the
new settings.

## Notes

- This bot works with **cracked (offline-mode) servers only** — no login
  password or auth-plugin logic is included, since it's not needed.
- `version: false` in the bot code means it auto-detects whatever Minecraft
  version your server is running — works fine with ViaVersion/ViaBackwards
  multi-version setups.
- Movement is intentionally simple (random walk + gentle turn, occasional
  sprint/crouch) to keep CPU and memory usage low, and to avoid anti-cheat
  kicks caused by instant/forced rotation.
- Reconnects use a small random delay (instead of a fixed timer) to avoid
  tripping connection-throttling on hosts like Aternos.
