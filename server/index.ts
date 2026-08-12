import express, { type Request, type Response } from 'express';
import cors from 'cors';
import pg from 'pg';
import type {
  Confidence,
  MealItemPayload,
  MealPayload,
  MealSource,
} from '../shared/contract.js';

// The phone talks to this server over the local network; the server is the
// only thing that ever opens a Postgres connection. React Native can't do
// that itself — it has no raw TCP sockets — which is why this layer exists.
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://localhost:5432/nourishtrack';
const PORT = Number(process.env.PORT) || 3000;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const app = express();
app.use(cors());
// Meals carry no image data (only a file path), so the default body limit
// is plenty.
app.use(express.json());

const VALID_SOURCES: MealSource[] = ['photo', 'manual'];
const VALID_CONFIDENCE: Confidence[] = ['high', 'medium', 'low'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSource(value: unknown): value is MealSource {
  return VALID_SOURCES.includes(value as MealSource);
}

function isConfidence(value: unknown): value is Confidence {
  return VALID_CONFIDENCE.includes(value as Confidence);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isLocalDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// The request body arrives as `unknown`. This narrows it into a MealPayload —
// the same type the app builds — or explains why it couldn't. The payload
// type is imported from shared/contract.ts, so if the app changes the wire
// format without changing this, the build breaks here.
type ReadResult =
  | { meal: MealPayload; error?: undefined }
  | { meal?: undefined; error: string };

function readMeal(body: unknown): ReadResult {
  if (!isRecord(body) || typeof body.id !== 'string' || body.id === '') {
    return { error: 'id is required' };
  }
  if (!isSource(body.source)) {
    return { error: `source must be one of ${VALID_SOURCES.join(', ')}` };
  }
  if (!isIsoTimestamp(body.loggedAt)) {
    return { error: 'loggedAt must be an ISO timestamp' };
  }
  if (!isLocalDate(body.localDate)) {
    return { error: 'localDate must be YYYY-MM-DD' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { error: 'items must be a non-empty array' };
  }

  const items: MealItemPayload[] = [];
  for (const [index, raw] of body.items.entries()) {
    if (!isRecord(raw)) {
      return { error: `items[${index}] must be an object` };
    }
    if (typeof raw.id !== 'string' || raw.id === '') {
      return { error: `items[${index}].id is required` };
    }
    if (typeof raw.name !== 'string' || raw.name.trim() === '') {
      return { error: `items[${index}].name is required` };
    }
    const calories = Number(raw.calories);
    if (!Number.isFinite(calories) || calories < 0) {
      return { error: `items[${index}].calories must be a number >= 0` };
    }
    items.push({
      id: raw.id,
      name: raw.name.trim(),
      portion: typeof raw.portion === 'string' && raw.portion !== '' ? raw.portion : null,
      calories: Math.round(calories),
      confidence: isConfidence(raw.confidence) ? raw.confidence : null,
      position: Number.isInteger(raw.position) ? (raw.position as number) : index,
    });
  }

  return {
    meal: {
      id: body.id,
      loggedAt: body.loggedAt,
      localDate: body.localDate,
      source: body.source,
      photoUri: typeof body.photoUri === 'string' ? body.photoUri : null,
      items,
    },
  };
}

// Lets the phone check the server is reachable before blaming the network.
app.get('/health', async (request: Request, response: Response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ ok: true });
  } catch (error) {
    console.error('Health check failed:', toMessage(error));
    response.status(503).json({ ok: false, error: 'database unreachable' });
  }
});

// A caught value is `unknown`, so it has to be narrowed before its message
// can be logged.
function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Saves a meal and its items. Written as an upsert so that a phone retrying
// after a timeout re-sends the same ids and updates the row instead of
// creating a duplicate.
app.post('/meals', async (request: Request, response: Response) => {
  const { meal, error: validationError } = readMeal(request.body);
  if (validationError !== undefined) {
    response.status(400).json({ error: validationError });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO meals (id, logged_at, local_date, source, photo_uri)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET logged_at = EXCLUDED.logged_at,
             local_date = EXCLUDED.local_date,
             source = EXCLUDED.source,
             photo_uri = EXCLUDED.photo_uri`,
      [meal.id, meal.loggedAt, meal.localDate, meal.source, meal.photoUri]
    );

    for (const item of meal.items) {
      await client.query(
        `INSERT INTO meal_items (id, meal_id, name, portion, calories, confidence, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               portion = EXCLUDED.portion,
               calories = EXCLUDED.calories,
               confidence = EXCLUDED.confidence,
               position = EXCLUDED.position`,
        [
          item.id,
          meal.id,
          item.name,
          item.portion,
          item.calories,
          item.confidence,
          item.position,
        ]
      );
    }

    await client.query('COMMIT');
    response.status(201).json({ id: meal.id, itemCount: meal.items.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to save meal:', toMessage(error));
    response.status(500).json({ error: 'could not save meal' });
  } finally {
    client.release();
  }
});

// Deletes one food from a meal, and the meal too if that was its last item.
// Deleting something already gone counts as success — the phone may retry a
// delete whose first attempt actually landed.
app.delete('/meal-items/:id', async (request: Request, response: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ meal_id: string }>(
      'DELETE FROM meal_items WHERE id = $1 RETURNING meal_id',
      [request.params.id]
    );
    const first = rows[0];
    if (first) {
      await client.query(
        `DELETE FROM meals
         WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM meal_items WHERE meal_id = $1)`,
        [first.meal_id]
      );
    }
    await client.query('COMMIT');
    response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete item:', toMessage(error));
    response.status(500).json({ error: 'could not delete item' });
  } finally {
    client.release();
  }
});

// Saves one glass of water. Upsert for the same reason meals are: the phone
// may retry a request whose first attempt actually landed.
app.post('/water', async (request: Request, response: Response) => {
  const body: unknown = request.body;
  if (!isRecord(body) || typeof body.id !== 'string' || body.id === '') {
    response.status(400).json({ error: 'id is required' });
    return;
  }
  const amountOz = Number(body.amountOz);
  if (!Number.isFinite(amountOz) || amountOz <= 0) {
    response.status(400).json({ error: 'amountOz must be a number > 0' });
    return;
  }
  if (!isIsoTimestamp(body.loggedAt)) {
    response.status(400).json({ error: 'loggedAt must be an ISO timestamp' });
    return;
  }
  if (!isLocalDate(body.localDate)) {
    response.status(400).json({ error: 'localDate must be YYYY-MM-DD' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO water_entries (id, logged_at, local_date, amount_oz)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET logged_at = EXCLUDED.logged_at,
             local_date = EXCLUDED.local_date,
             amount_oz = EXCLUDED.amount_oz`,
      [body.id, body.loggedAt, body.localDate, Math.round(amountOz)]
    );
    response.status(201).json({ id: body.id });
  } catch (error) {
    console.error('Failed to save water:', toMessage(error));
    response.status(500).json({ error: 'could not save water entry' });
  }
});

// Deleting something already gone counts as success, same as meal items.
app.delete('/water/:id', async (request: Request, response: Response) => {
  try {
    await pool.query('DELETE FROM water_entries WHERE id = $1', [
      request.params.id,
    ]);
    response.status(204).end();
  } catch (error) {
    console.error('Failed to delete water entry:', toMessage(error));
    response.status(500).json({ error: 'could not delete water entry' });
  }
});

// Reads one day's water back, with the day's total worked out in SQL.
app.get('/water', async (request: Request, response: Response) => {
  const date = request.query.date;
  if (!isLocalDate(date)) {
    response.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      logged_at: Date;
      amount_oz: number;
    }>(
      `SELECT id, logged_at, amount_oz
         FROM water_entries
        WHERE local_date = $1
        ORDER BY logged_at`,
      [date]
    );
    const totalOz = rows.reduce((sum, row) => sum + row.amount_oz, 0);
    response.json({ entries: rows, totalOz });
  } catch (error) {
    console.error('Failed to read water:', toMessage(error));
    response.status(500).json({ error: 'could not read water' });
  }
});

// Reads back one day's meals, newest first, each with its items. Not needed
// to log food — it's how you prove the data really is in Postgres.
app.get('/meals', async (request: Request, response: Response) => {
  const date = request.query.date;
  if (!isLocalDate(date)) {
    response.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  try {
    const { rows } = await pool.query(
      // local_date is rendered as text because node-postgres turns a DATE
      // into a JS Date at midnight UTC, which reads back as the previous
      // day in any timezone behind UTC.
      `SELECT m.id,
              m.logged_at,
              to_char(m.local_date, 'YYYY-MM-DD') AS local_date,
              m.source,
              m.photo_uri,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', i.id,
                    'name', i.name,
                    'portion', i.portion,
                    'calories', i.calories,
                    'confidence', i.confidence
                  ) ORDER BY i.position
                ) FILTER (WHERE i.id IS NOT NULL),
                '[]'
              ) AS items
         FROM meals m
         LEFT JOIN meal_items i ON i.meal_id = m.id
        WHERE m.local_date = $1
        GROUP BY m.id
        ORDER BY m.logged_at DESC`,
      [date]
    );
    response.json({ meals: rows });
  } catch (error) {
    console.error('Failed to read meals:', toMessage(error));
    response.status(500).json({ error: 'could not read meals' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NourishTrack API listening on http://0.0.0.0:${PORT}`);
  console.log(`Database: ${DATABASE_URL}`);
});
