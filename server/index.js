import express from 'express';
import cors from 'cors';
import pg from 'pg';

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

const VALID_SOURCES = ['photo', 'manual'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

// Pulls a meal out of the request body, returning either { meal } or
// { error } so the route stays flat and readable.
function readMeal(body) {
  if (!body || typeof body.id !== 'string' || body.id === '') {
    return { error: 'id is required' };
  }
  if (!VALID_SOURCES.includes(body.source)) {
    return { error: `source must be one of ${VALID_SOURCES.join(', ')}` };
  }
  if (typeof body.loggedAt !== 'string' || Number.isNaN(Date.parse(body.loggedAt))) {
    return { error: 'loggedAt must be an ISO timestamp' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.localDate || '')) {
    return { error: 'localDate must be YYYY-MM-DD' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { error: 'items must be a non-empty array' };
  }

  const items = [];
  for (const [index, item] of body.items.entries()) {
    if (typeof item.id !== 'string' || item.id === '') {
      return { error: `items[${index}].id is required` };
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      return { error: `items[${index}].name is required` };
    }
    const calories = Number(item.calories);
    if (!Number.isFinite(calories) || calories < 0) {
      return { error: `items[${index}].calories must be a number >= 0` };
    }
    items.push({
      id: item.id,
      name: item.name.trim(),
      portion: item.portion || null,
      calories: Math.round(calories),
      confidence: VALID_CONFIDENCE.includes(item.confidence)
        ? item.confidence
        : null,
      position: Number.isInteger(item.position) ? item.position : index,
    });
  }

  return {
    meal: {
      id: body.id,
      loggedAt: body.loggedAt,
      localDate: body.localDate,
      source: body.source,
      photoUri: body.photoUri || null,
      items,
    },
  };
}

// Lets the phone check the server is reachable before blaming the network.
app.get('/health', async (request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ ok: true });
  } catch (error) {
    console.error('Health check failed:', error.message);
    response.status(503).json({ ok: false, error: 'database unreachable' });
  }
});

// Saves a meal and its items. Written as an upsert so that a phone retrying
// after a timeout re-sends the same ids and updates the row instead of
// creating a duplicate.
app.post('/meals', async (request, response) => {
  const { meal, error: validationError } = readMeal(request.body);
  if (validationError) {
    return response.status(400).json({ error: validationError });
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
    console.error('Failed to save meal:', error.message);
    response.status(500).json({ error: 'could not save meal' });
  } finally {
    client.release();
  }
});

// Deletes one food from a meal, and the meal too if that was its last item.
// Deleting something already gone counts as success — the phone may retry a
// delete whose first attempt actually landed.
app.delete('/meal-items/:id', async (request, response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'DELETE FROM meal_items WHERE id = $1 RETURNING meal_id',
      [request.params.id]
    );
    if (rows.length > 0) {
      await client.query(
        `DELETE FROM meals
         WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM meal_items WHERE meal_id = $1)`,
        [rows[0].meal_id]
      );
    }
    await client.query('COMMIT');
    response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete item:', error.message);
    response.status(500).json({ error: 'could not delete item' });
  } finally {
    client.release();
  }
});

// Saves one glass of water. Upsert for the same reason meals are: the phone
// may retry a request whose first attempt actually landed.
app.post('/water', async (request, response) => {
  const body = request.body || {};
  const amountOz = Number(body.amountOz);
  if (typeof body.id !== 'string' || body.id === '') {
    return response.status(400).json({ error: 'id is required' });
  }
  if (!Number.isFinite(amountOz) || amountOz <= 0) {
    return response.status(400).json({ error: 'amountOz must be a number > 0' });
  }
  if (typeof body.loggedAt !== 'string' || Number.isNaN(Date.parse(body.loggedAt))) {
    return response.status(400).json({ error: 'loggedAt must be an ISO timestamp' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.localDate || '')) {
    return response.status(400).json({ error: 'localDate must be YYYY-MM-DD' });
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
    console.error('Failed to save water:', error.message);
    response.status(500).json({ error: 'could not save water entry' });
  }
});

// Deleting something already gone counts as success, same as meal items.
app.delete('/water/:id', async (request, response) => {
  try {
    await pool.query('DELETE FROM water_entries WHERE id = $1', [
      request.params.id,
    ]);
    response.status(204).end();
  } catch (error) {
    console.error('Failed to delete water entry:', error.message);
    response.status(500).json({ error: 'could not delete water entry' });
  }
});

// Reads one day's water back, with the day's total worked out in SQL.
app.get('/water', async (request, response) => {
  const date = request.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return response.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, logged_at, amount_oz
         FROM water_entries
        WHERE local_date = $1
        ORDER BY logged_at`,
      [date]
    );
    const totalOz = rows.reduce((sum, row) => sum + row.amount_oz, 0);
    response.json({ entries: rows, totalOz });
  } catch (error) {
    console.error('Failed to read water:', error.message);
    response.status(500).json({ error: 'could not read water' });
  }
});

// Reads back one day's meals, newest first, each with its items. Not needed
// to log food — it's how you prove the data really is in Postgres.
app.get('/meals', async (request, response) => {
  const date = request.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return response.status(400).json({ error: 'date must be YYYY-MM-DD' });
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
    console.error('Failed to read meals:', error.message);
    response.status(500).json({ error: 'could not read meals' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NourishTrack API listening on http://0.0.0.0:${PORT}`);
  console.log(`Database: ${DATABASE_URL}`);
});
