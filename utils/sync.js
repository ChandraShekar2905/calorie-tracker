import {
  saveMeal,
  deleteMealItem,
  saveWaterEntry,
  deleteWaterEntry,
} from './api';

// The app stores food as one flat list of entries, because that's what the
// Today screen renders. Postgres stores meals and their items in two tables,
// because two foods from the same photo are one meal. This file is the
// translation between those two shapes. Water needs no translation — one
// entry is one row.

// Entries logged together share a mealId, so grouping by it rebuilds the meal.
function groupIntoMeals(entries) {
  const mealsById = new Map();

  entries.forEach((entry) => {
    let meal = mealsById.get(entry.mealId);
    if (!meal) {
      meal = {
        id: entry.mealId,
        loggedAt: entry.time,
        localDate: entry.localDate,
        source: entry.source,
        photoUri: entry.photoUri || null,
        items: [],
      };
      mealsById.set(entry.mealId, meal);
    }
    meal.items.push({
      id: entry.id,
      name: entry.name,
      portion: entry.portion || null,
      calories: entry.calories,
      confidence: entry.confidence || null,
      position: meal.items.length,
    });
  });

  return [...mealsById.values()];
}

// Runs every queued delete, returning the ids that didn't go through so they
// can be retried later.
async function runDeletes(ids, deleteOne, label) {
  const stillPending = [];
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

// Pushes everything the server hasn't seen yet. Nothing here throws: a sync
// failure is expected (server off, wrong wifi) and must never break the app,
// so failures come back in the return value instead.
//
// Returns:
//   syncedFoodIds / syncedWaterIds — entries the server accepted, to be
//                                    marked locally
//   pendingDeletes / pendingWaterDeletes — deletes that still haven't landed
//   ok — whether everything succeeded
export async function syncPendingChanges({
  foods,
  water,
  pendingDeletes,
  pendingWaterDeletes,
}) {
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
  let ok =
    remainingDeletes.length === 0 && remainingWaterDeletes.length === 0;

  const syncedFoodIds = [];
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

  const syncedWaterIds = [];
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
