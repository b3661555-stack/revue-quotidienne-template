# Chatdex

**Gotta catch ’em cats.** A mobile-first social game for photographing the real-world cats you meet, building a collection, and discovering which cats other hunters have already found.

Loop: discover → photograph → identify → collect → explore → share → discover again.

## Quick start

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`, so there's no database server to install).

```bash
cd chatdex
npm install
npm run dev
```

Open http://localhost:3000. On first start a demo world is seeded (12 fictional hunters, 48 cats around Lake Geneva, ~340 sightings). Tap **"Explore the demo world"** or log in with `demo@chatdex.app` / `chatdex`, or create your own account.

On a phone on the same network, open `http://<your-computer-ip>:3000`. Geolocation needs HTTPS (or localhost); without it the app asks you to pick your town instead.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Express API + Vite with hot reload) on one port |
| `npm run build` | Build the frontend into `dist/` |
| `npm start` | Production server (serves `dist/` + API). Run `npm run build` first |
| `npm test` | API integration tests (node:test, throwaway DB) + translation consistency checks |
| `npm run test:e2e` | Builds, starts a server and runs the main user journeys in headless Chromium, including every language and Arabic RTL |
| `npm run seed` | Seed demo data if absent |
| `npm run db:reset` | Wipe the database and uploads, then reseed |
| `npm run demo:clear` | Delete every demo row (users, cats, hunts), keep real accounts |

## Environment variables

All optional; copy `.env.example` to `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | SQLite database (`chatdex.db`) and uploaded photos (`uploads/`) |
| `DB_PATH` | `$DATA_DIR/chatdex.db` | Override the database file |
| `DEMO_DATA` | `true` | Seed the demo world on first start |
| `CORS_ORIGINS` | `capacitor://localhost,https://localhost,http://localhost` | Origins allowed to call the API cross-origin (the native apps) |
| `CAT_DETECTOR` | `coco-ssd` | In-browser cat detection (TensorFlow.js from jsDelivr). `off` = always ask the user |
| `MISSING_AFTER_DAYS` | `30` | Days without sightings before a cat shows as "not observed recently" |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |

## Deployment

It's a single Node process with a SQLite file, so any host with a persistent disk works.

**Docker**
```bash
docker build -t chatdex .
docker run -p 3000:3000 -v chatdex-data:/data -e COOKIE_SECURE=true chatdex
```

**Render:** `render.yaml` at the repository root is a ready Blueprint (Render → New → Blueprint), with a 1 GB persistent disk for the database and photos.

**Railway / Fly.io:** build command `npm ci && npm run build`, start command `npm start`, mount a persistent volume and set `DATA_DIR` to it. Put it behind HTTPS (these platforms do by default) and set `COOKIE_SECURE=true`. For production, set `DEMO_DATA=false` or run `npm run demo:clear` once real users arrive.

## Mobile apps (iOS and Android)

`android/` and `ios/` are [Capacitor](https://capacitorjs.com) projects that bundle the web UI and talk to your deployed server (bearer-token auth, CORS allowed for `capacitor://localhost` and `https://localhost`).

```bash
CHATDEX_API_URL=https://your-chatdex.onrender.com npm run build:mobile   # build UI + copy into native projects
npm run cap:android    # open in Android Studio
npm run cap:ios        # open in Xcode (macOS)
```

- Permission prompts (camera, photos, location) are localized in 15 languages: `scripts/native-permissions.py` (re-run after re-creating a platform).
- Icons and splash screens come from `assets/` (`npx @capacitor/assets generate`).
- GitHub Actions (`.github/workflows/chatdex-mobile.yml`) builds a debug APK on every push and, on manual runs, an unsigned iOS simulator build. Set the repository variable `CHATDEX_API_URL`.
- Step-by-step publishing guide (French): [`docs/PUBLIER.md`](docs/PUBLIER.md). Store listing texts: [`docs/fiches-stores.md`](docs/fiches-stores.md). Privacy policy: `public/privacy.html` (served at `/privacy.html`).

## Architecture

```
chatdex/
  server/                 Express 5 API (ES modules)
    index.js              boot: seed demo, Vite middleware (dev) or static dist (prod)
    app.js                middleware, /api, /uploads, error handler
    db.js, schema.sql     node:sqlite, schema applied on start
    auth.js               scrypt password hashing, HttpOnly session cookie
    routes/api.js         all REST endpoints
    services/
      captures.js         the core action: record a sighting (new cat or known cat), XP, events
      matcher.js          cat re-identification (swap point for real computer vision)
      game.js             rarity, XP table, levels, titles
      achievementDefs.js  badge catalogue
      progress.js         stats, XP awarding, badges, feed events, notifications
      hunts.js            Cat Hunt progress/completion
      geo.js              coordinate snapping, offline region names
      uploads.js          photo validation + local disk storage (swap for S3/R2 here)
    seed.js               demo world, clear/reset
  src/                    React 19 SPA (Vite), plain CSS, Leaflet map
    pages/                Welcome, Home, Explore, Capture, Dex, CatProfile, Profile, Hunts, …
    lib/                  image processing, detector, procedural cat art, location
  tests/                  API tests + Playwright e2e
```

One process, one port, one SQLite file. The demo seed replays sightings through the same `recordCapture` logic real users hit, so demo XP, badges and counters are consistent with the rules.

### Data model

`users`, `sessions`, `cats`, `observations`, `follows` (follower, following, status), `favorites`, `cat_tags` (community personality tags), `reactions`, `achievements`, `user_achievements`, `events` (feed), `notifications`, `hunts`, `hunt_participants`, `match_feedback` (Yes/No/Not sure answers), `reports`. Every table that holds demo content has an `is_demo` flag. See `server/schema.sql`.

Users never own cats. They own their observations; a cat's collection is the set of hunters who observed it, and the first one keeps the 👑 First Catch.

### Identification pipeline

1. **Browser**: photo resized to 1280 px JPEG + 360 px thumbnail. If available, COCO-SSD runs on-device to detect cats and get a bounding box ("Cat detected!"). Otherwise the user confirms there's a cat.
2. **Browser**: a tiny fingerprint of the cat region (64-bin colour histogram + 64-bit difference hash) and a coat-colour suggestion.
3. **User** confirms coat colour, pattern and eyes (a few taps).
4. **Server** (`matcher.js`): candidates within 1.5 km, scored by attributes (45 %), visual fingerprint (30 %) and distance (25 %).
5. **User** answers "Could this be Milo?" Yes / No / Not sure, or picks a cat manually. Answers go to `match_feedback`.

To plug in a real model, keep `findCandidates(input) → [{ catId, score, reasons }]` and replace the scoring with image embeddings or a vision API. `match_feedback` gives labelled pairs for evaluation.

### Languages

The interface is available in 15 languages: English, Français, Deutsch, Italiano, Español, Português, Русский, Türkçe, العربية (right-to-left), हिन्दी, বাংলা, 中文（简体）, 日本語, 한국어 and Bahasa Indonesia.

- The language follows the browser/phone setting on first visit and can be changed from the welcome screen or **Profile → ⚙️ → Language** (remembered on the device).
- `src/i18n/index.jsx` is a ~100-line i18n layer: flat dictionaries in `src/i18n/locales/*.js`, `{placeholder}` interpolation (including React elements), CLDR plurals and ordinals via `Intl.PluralRules`, relative times and dates via `Intl`. Only English is in the main bundle; other languages are loaded on demand.
- The server stays language-neutral: API errors return a stable `code` + `params` (English `error` text kept as fallback, catalogue in `server/errors.js`), notifications store `type` + `data`, XP lines carry a `key`, and game vocabulary (rarities, coat colours, badges, titles) is sent as ids.
- User content (cat names, bios, custom tags) is never translated.
- **Adding a language:** copy `en.js` to `<code>.js`, translate the values, add the code to `LANGUAGES` in `src/i18n/index.jsx`, then run `npm test`. `tests/i18n.test.js` checks every locale for missing/extra keys, placeholders and valid plural categories.

### Rarity

Deterministic, based on how unusual the visual combination is (coat + pattern + eye points), never on the animal's "worth": Common → Uncommon → Rare → Epic → Legendary. About 1 cat in 40 is ✨ Shiny, decided by the cat's random seed at registration.

### Privacy and safety

- Observation coordinates are snapped to about 110 m before storage; public cat positions to about 250 m and drawn as a soft circle, never a pin. Active hunters appear on a ~1 km grid.
- Exact coordinates never reach the database.
- Registration requires accepting the "Respect the cats" guidelines (distance, public ground, no feeding, no chasing); tips rotate on the capture screen.
- Report button on captures, cats and users. 3 distinct reports hide a capture, 5 hide a cat.
- "Not observed for N days" is presented as a game state, never as the animal being lost.

## Implemented features

- Email/password accounts, editable profile (emoji avatar, colour, bio, favourite cat), logout
- Capture flow: camera or gallery, on-device cat detection with fallback, attribute tagging, existing-vs-new matching, "Could this be…?" confirmation, manual pick, naming with personality tags, animated reward (XP breakdown, level up, badges, hunt progress, confetti)
- 👑 First Catch, hunter rank ("you are the 8th hunter"), re-spotting a missing cat (🚨 notification to all its hunters)
- Chatdex: all community cats with silhouettes for uncollected ones, my collection, rarity filters, search, sort
- Cat profile: hero photo, rarity, legend title (👑 Legend of Montreux when 10+ hunters), active/not-seen status, stats, First Catch, hall of fame, looks, community tags, approximate territory map, photo gallery, sightings timeline with reactions, favourite, report
- Explore map: cats (collected vs not), 🔥 weekly hotspots, active hunters, live hunts, "N cats around you", offline tile fallback
- Social: follow/unfollow, followers lists, feed (Everyone / Following), reactions ❤️ 🐾 🔥 👀, suggested hunters, friend comparison ("You vs Sarah")
- XP & levels with titles, 15 badges with progress, in-app notifications
- Cat Hunts: create (area, duration, goal), join/leave, live countdown and progress ring, completion bonus
- Error handling: offline banner, failed upload with retry keeping the capture, invalid photo, location denied (town picker), camera fallback to gallery, detector unavailable, map tiles unavailable, empty states everywhere
- 15 interface languages with automatic detection, a language switcher and right-to-left layout for Arabic
- Demo mode with clearly flagged demo data and procedural cat portraits (no copyrighted assets)

## Deferred on purpose

- Real cat re-identification model (embeddings / vision API) and learning from `match_feedback`
- Push notifications and real-time (WebSocket) hunts; the app polls instead
- Moderation dashboard (reports are stored and auto-hide content, but there's no admin UI)
- Password reset by email, OAuth providers
- Photo storage on S3/R2 and image CDN; EXIF stripping on the server (the browser re-encodes photos, which already drops EXIF)
- Community events, recommendations, analytics, global leaderboards (friendly comparison only)
- Offline capture queue, push notifications in the native apps
