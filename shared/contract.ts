// The HTTP contract between the app and the API server. Both sides import
// these, so a change to the wire format breaks the build on whichever side
// hasn't caught up — which is the whole reason this file is shared rather
// than described twice.
//
// These are the shapes that cross the network. They are deliberately not the
// same as the app's own types in types.ts: the app stores a flat list of food
// entries because that's what it renders, while the server stores meals and
// their items in two tables. utils/sync.ts translates between them.

// Mirrors the CHECK constraints in server/schema.sql.
export type Confidence = 'high' | 'medium' | 'low';
export type MealSource = 'photo' | 'manual';

export type MealItemPayload = {
  id: string;
  name: string;
  portion: string | null;
  calories: number;
  /** null for manually typed food, which no model ever looked at. */
  confidence: Confidence | null;
  position: number;
};

export type MealPayload = {
  id: string;
  /** ISO 8601 timestamp. */
  loggedAt: string;
  /** YYYY-MM-DD in the device's local timezone, not UTC. */
  localDate: string;
  source: MealSource;
  photoUri: string | null;
  items: MealItemPayload[];
};

export type WaterPayload = {
  id: string;
  amountOz: number;
  loggedAt: string;
  localDate: string;
};

// Read-back responses. Only used to prove the data landed in Postgres.
export type MealsResponse = {
  meals: {
    id: string;
    logged_at: string;
    local_date: string;
    source: MealSource;
    photo_uri: string | null;
    items: Omit<MealItemPayload, 'position'>[];
  }[];
};

export type WaterResponse = {
  entries: { id: string; logged_at: string; amount_oz: number }[];
  totalOz: number;
};
