// The app's own domain types — what lives in React state and AsyncStorage.
// The shapes that cross the network live in shared/contract.ts.

import type { Confidence, MealSource } from './shared/contract';

export type { Confidence, MealSource };

/** One food the vision model found, before the user confirms it. */
export type AnalyzedItem = {
  name: string;
  portion: string;
  calories: number;
  confidence: Confidence;
};

/** An analyzed item the user has confirmed and is about to log. */
export type ConfirmedItem = {
  name: string;
  portion: string;
  confidence: Confidence;
  calories: number;
};

/**
 * One food in the day's log. Entries confirmed from the same photo share a
 * mealId and a photoUri, which is how sync.ts rebuilds them into one meal.
 */
export type FoodEntry = {
  id: string;
  mealId: string;
  name: string;
  calories: number;
  portion: string;
  /** null for manually typed food. */
  confidence: Confidence | null;
  source: MealSource;
  /** ISO 8601 timestamp. */
  time: string;
  /** YYYY-MM-DD, local. */
  localDate: string;
  photoUri?: string;
  /** Whether the server has this entry yet. */
  synced: boolean;
};

export type WaterEntry = {
  id: string;
  amountOz: number;
  time: string;
  localDate: string;
  synced: boolean;
};

/** Everything stored under one day's AsyncStorage key. */
export type DayData = {
  foods: FoodEntry[];
  water: WaterEntry[];
  /** Ids of meal items deleted locally that the server hasn't been told about. */
  pendingDeletes: string[];
  pendingWaterDeletes: string[];
};

/** The three bottom tabs. A union rather than a string, so a typo in a tab
 * name is a build error instead of a screen that silently renders nothing. */
export type TabId = 'today' | 'log' | 'water';

/** A photo taken or picked, ready to send for analysis. */
export type Photo = {
  uri: string;
  base64: string;
  mimeType: string;
};
