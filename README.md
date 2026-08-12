# NourishTrack

A calorie and water tracker for iOS and Android. Point your camera at a meal
and it identifies the food, estimates the calories per item, and lets you
correct anything before it's logged.

Built with Expo (SDK 54) and TypeScript, backed by Postgres.

## Demo

**[Watch the walkthrough (1:47)](https://drive.google.com/file/d/14-9aDVfTiiIGZF_RSacPHnKG9Ve7-k3E/view?usp=drive_link)** — the app running on a phone.

## What it does

- **Photo meal logging** — take or pick a photo, and a vision model returns
  each food it finds with a portion, a calorie estimate and a confidence
  level. Every value is editable before you confirm, and items can be removed.
- **Manual logging** — type a name and calories.
- **Water tracking** — quick-add buttons plus an arbitrary custom amount,
  against a daily goal.
- **Delete anything** — individual food and water entries.
- **Daily history** — each day is stored under its own local-date key, so a
  new day starts clean while previous days stay intact.

## Architecture

```
  phone (Expo Go)                        laptop / server
 ┌──────────────────┐                  ┌──────────────────┐
 │  React Native    │                  │  Express API     │
 │                  │ ── HTTP ───────▶ │                  │
 │  AsyncStorage ◀──┤  (background     │  pg ──▶ Postgres │
 │  (source of      │   sync)          │                  │
 │   truth for UI)  │                  └──────────────────┘
 └────────┬─────────┘
          │  HTTPS
          ▼
   Gemini API (vision)
```

React Native has no raw TCP sockets, so the phone can't run a Postgres driver
and can never talk to the database directly. The Express server in `server/`
exists to own that connection.

### Local-first sync

The UI reads and writes AsyncStorage, and Postgres is written in the
background. A logged meal is saved locally before any network call happens, so
losing the server mid-use is a non-event: the app keeps working, the Today
screen shows a pending count, and the queue flushes when the server comes
back. Failed deletes stay queued too.

Ids are generated on the device, every write is an upsert, and deleting an
already-deleted row returns success — so any request can be safely retried
after a timeout without creating duplicates.

### Shared types

`shared/contract.ts` holds the types for everything crossing the network, and
both the app and the server import it. Changing the wire format on one side
without the other breaks the build instead of surfacing as a runtime 400.

These are kept separate from the app's own types in `types.ts`, because the
two models genuinely differ: the app holds a flat list of entries because
that's what it renders, while Postgres stores meals and their items in two
tables. `utils/sync.ts` is the translation between them.

## Layout

```
App.tsx              screen switching, app state, the sync effect
types.ts             the app's domain types
shared/contract.ts   wire types, imported by app and server
components/          one file per screen, plus TabBar and ProgressBar
utils/
  analyzeMeal.ts     Gemini call + defensive parsing of model output
  photoPicker.ts     camera / library access
  storage.ts         AsyncStorage, keyed by local date
  api.ts             typed HTTP client
  sync.ts            flat entries ⇄ meals + items
server/              Express + Postgres (see server/README.md)
```

## Setup

Requires Node, Postgres, and the Expo Go app on your phone.

**1. Install and configure**

```bash
npm install
cp config.example.ts config.ts
```

Fill in `config.ts`: a Gemini API key from
[aistudio.google.com](https://aistudio.google.com/), and `API_BASE_URL`
pointing at your machine on the local network. It is gitignored — the key
never gets committed.

**2. Start the database and API**

```bash
createdb nourishtrack
psql postgres://localhost:5432/nourishtrack -f server/schema.sql
cd server && npm install && npm start
```

**3. Start the app**

```bash
npx expo start
```

Scan the QR code with Expo Go, with the phone on the same network as the
machine running the server.

## Checks

```bash
npm run typecheck               # app, strict
cd server && npm run typecheck  # server, strict
```

`strict` is enabled explicitly — Expo's `tsconfig.base` does not turn it on,
and without it null-tracking and implicit `any` go unchecked. Note that Metro
strips types without checking them, so the app will bundle and run with type
errors present; `typecheck` has to be run deliberately.

## Known limitations

- **Photos are stored by file URI, not copied.** `expo-image-picker` writes to
  the app's cache directory, which the OS may purge — old thumbnails can go
  blank. The fix is to copy into the documents directory with
  `expo-file-system` at confirm time.
- **The phone and server must share a network.** Guest wifi that blocks
  device-to-device traffic will stop the sync, though not the app.
- **Calorie estimates are estimates.** The model returns a confidence level
  per item and the UI surfaces it, but the numbers are a starting point to
  correct, not a measurement.
- **The Gemini free tier allows 5 requests/minute and 20/day per model.**
  Nothing retries automatically; every analysis is user-initiated.
- **No authentication.** The API assumes a trusted local network and a single
  user. Multi-user would need accounts and a `user_id` on both tables.

## What I'd build next

- Copy meal photos out of the cache directory so history survives.
- Macros (protein/carbs/fat) per item, which the model can already estimate.
- Meal grouping in the UI, so a photo's items collapse into one row.
- Reading history back from Postgres, so a reinstalled app isn't empty.
- Tests around `sync.ts` and the storage migration — the two places where a
  bug would quietly lose data.

## License

MIT — see [LICENSE](LICENSE).
