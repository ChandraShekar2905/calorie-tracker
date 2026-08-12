import {
  saveMeal,
  deleteMealItem,
  saveWaterEntry,
  deleteWaterEntry,
} from './api';
import type { MealPayload } from '../shared/contract';
import type { FoodEntry, WaterEntry } from '../types';

// The app stores food as one flat list of entries, because that's what the
// Today screen renders. Postgres stores meals and their items in two tables,
// because two foods from the same photo are one meal. This file is the
// translation between those two shapes. Water needs no translation — one
// entry is one row.

// Entries logged together share a mealId, so grouping by it rebuilds the meal.
function groupIntoMeals(entries: FoodEntry[]): MealPayload[] {
  const mealsById = new Map<string, MealPayload>();

  entries.forEach((entry) => {
    let meal = mealsById.get(entry.mealId);
    if (!meal) {
      meal = {
        id: entry.mealId,
        loggedAt: entry.time,
        localDate: entry.localDate,
        source: entry.source,
        photoUri: entry.photoUri ?? null,
        items: [],
      };
      mealsById.set(entry.mealId, meal);
    }
    meal.items.push({
      id: entry.id,
      name: entry.name,
      portion: entry.portion || null,
      calories: entry.calories,
      confidence: entry.confidence,
      position: meal.items.length,
    });
  });

  return [...mealsById.values()];
}

// Runs every queued delete, returning the ids that didn't go through so they
// can be retried later.
async function runDeletes(
  ids: string[],
  deleteOne: (id: string) => Promise<void>,
  label: string
): Promise<string[]> {
  const stillPending: string[] = [];
  for (const id of ids) {
    try {
      await deleteOne(id);
    } catch (error) {
      console.warn(`NourishTrack: could not delete ${label} on server`, error);
      stillPending.push(id);
    }
  }
  return stillPending;
}

export type SyncInput = {
  foods: FoodEntry[];
  water: WaterEntry[];
  pendingDeletes: string[];
  pendingWaterDeletes: string[];
};

export type SyncResult = {
  /** Entry ids the server accepted, to be marked synced locally. */
  syncedFoodIds: string[];
  syncedWaterIds: string[];
  /** Deletes that still haven't landed. */
  pendingDeletes: string[];
  pendingWaterDeletes: string[];
  ok: boolean;
};

// Pushes everything the server hasn't seen yet. Nothing here throws: a sync
// failure is expected (server off, wrong wifi) and must never break the app,
// so failures come back in the result instead.
export async function syncPendingChanges({
  foods,
  water,
  pendingDeletes,
  pendingWaterDeletes,
}: SyncInput): Promise<SyncResult> {
  // Deletes run first so a queued delete doesn't sit behind a failing upload.
  const remainingDeletes = await runDeletes(
    pendingDeletes,
    deleteMealItem,
    'meal item'
  );
  const remainingWaterDeletes = await runDeletes(
    pendingWaterDeletes,
    deleteWaterEntry,
    'water entry'
  );
  let ok = remainingDeletes.length === 0 && remainingWaterDeletes.length === 0;

  const syncedFoodIds: string[] = [];
  const unsyncedMeals = groupIntoMeals(foods.filter((food) => !food.synced));
  for (const meal of unsyncedMeals) {
    try {
      await saveMeal(meal);
      meal.items.forEach((item) => syncedFoodIds.push(item.id));
    } catch (error) {
      console.warn('NourishTrack: could not save meal on server', error);
      ok = false;
    }
  }

  const syncedWaterIds: string[] = [];
  for (const entry of water.filter((waterEntry) => !waterEntry.synced)) {
    try {
      await saveWaterEntry({
        id: entry.id,
        amountOz: entry.amountOz,
        loggedAt: entry.time,
        localDate: entry.localDate,
      });
      syncedWaterIds.push(entry.id);
    } catch (error) {
      console.warn('NourishTrack: could not save water entry on server', error);
      ok = false;
    }
  }

  return {
    syncedFoodIds,
    syncedWaterIds,
    pendingDeletes: remainingDeletes,
    pendingWaterDeletes: remainingWaterDeletes,
    ok,
  };
}
