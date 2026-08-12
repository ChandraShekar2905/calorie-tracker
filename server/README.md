# NourishTrack API

A small Express server that owns the Postgres connection. The phone talks to
this over the local network; it never talks to Postgres directly, because
React Native has no raw TCP sockets and so can't run a Postgres driver.

```
phone (Expo Go) --HTTP--> this server --TCP--> Postgres
```

## Data model

Three tables (see `schema.sql`):

- **meals** — one row per logging event (a confirmed photo, or one typed food)
- **meal_items** — one row per food within a meal, with the portion and the
  vision model's confidence
- **water_entries** — one row per glass. Kept separate from meals rather than
  folded in: water has no items, no photo and no calories, so sharing the
  meals table would leave most columns NULL for half the rows.

A photo of a burger and fries is one meal with two items. Ids are generated on
the phone, so a meal is saved locally first and pushed here later under the
same id.

## Endpoints

| Method | Path              | Purpose                                        |
| ------ | ----------------- | ---------------------------------------------- |
| GET    | `/health`         | Is the server up and is Postgres reachable?    |
| POST   | `/meals`          | Upsert a meal and its items (safe to retry)    |
| DELETE | `/meal-items/:id` | Delete one food; drops the meal if it's the last one |
| GET    | `/meals?date=YYYY-MM-DD` | Read a day's meals back out of Postgres |
| POST   | `/water`          | Upsert one water entry (safe to retry)         |
| DELETE | `/water/:id`      | Delete one water entry                         |
| GET    | `/water?date=YYYY-MM-DD` | Read a day's water back, with the total  |

Every write is an upsert and every `DELETE` treats an already-deleted row as
success, so the phone can retry any of them safely after a timeout.

## A note on older saved days

Water used to be stored on the phone as bare numbers (`[8, 16]`) with no ids
or timestamps. Entries now need both so they can be written to and deleted
from Postgres, so `utils/storage.js` converts old days as it reads them. Their
original times are gone, so they're given midday local — far enough from
midnight that no timezone shift can move them to the wrong day. Converted
entries are marked unsynced, so opening an old day back-fills it into the
database.

## First-time setup

```bash
createdb nourishtrack
psql postgres://localhost:5432/nourishtrack -f schema.sql
npm install
```

## Running it

```bash
npm start          # listens on 0.0.0.0:3000
```

Override the database with `DATABASE_URL` and the port with `PORT` if needed.

## Pointing the app at it

The phone can't use `localhost` — that would mean the phone itself. Find the
laptop's address on the current wifi:

```bash
ipconfig getifaddr en0
```

and set `API_BASE_URL` in the project's `config.js` to `http://THAT_IP:3000`.
**This changes when you join a different network**, so re-check it before a
demo, and confirm with:

```bash
curl http://THAT_IP:3000/health     # {"ok":true}
```

## If the phone can't reach it

The app keeps working — every entry is saved to AsyncStorage first and the
Today screen just shows "N not saved · Retry". Nothing is lost; the sync
catches up once the server is reachable again. Usual causes:

- laptop and phone on different networks (or phone on cellular)
- guest wifi blocking device-to-device traffic
- laptop firewall prompting for incoming connections
- stale IP in `config.js` after switching networks
