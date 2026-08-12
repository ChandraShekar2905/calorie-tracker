import AsyncStorage from '@react-native-async-storage/async-storage';

// All of a day's data lives under one key, e.g. "nourishtrack:2026-08-04".
// A new date means a new key, so each day starts fresh while history stays saved.
const KEY_PREFIX = 'nourishtrack:';

// Today's date as YYYY-MM-DD in the device's local timezone.
export function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A function, not a shared constant, so no two callers can ever end up
// holding the same arrays.
function emptyDay() {
  return { foods: [], water: [], pendingDeletes: [], pendingWaterDeletes: [] };
}

// Water used to be stored as bare numbers ([8, 16]). Each entry now needs an
// id and a timestamp so it can be saved to and deleted from Postgres, so
// older days are converted as they're read. Their real times are gone, so
// they get midday local — far enough from midnight that no timezone shift
// can drag them into the wrong day. They're marked unsynced, which means an
// old day opened after this change will back-fill itself into the database.
function normalizeWater(saved, dateKey) {
  if (!Array.isArray(saved)) {
    return [];
  }
  return saved.map((entry, index) => {
    if (typeof entry !== 'number') {
      return entry;
    }
    return {
      id: `water-legacy-${dateKey}-${index}`,
      amountOz: entry,
      time: new Date(`${dateKey}T12:00:00`).toISOString(),
      localDate: dateKey,
      synced: false,
    };
  });
}

// Loads one day's data. Returns an empty day if nothing is saved
// or if anything goes wrong reading/parsing.
export async function loadDay(dateKey) {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + dateKey);
    if (raw === null) {
      return emptyDay();
    }
    const parsed = JSON.parse(raw);
    return {
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      water: normalizeWater(parsed.water, dateKey),
      // Days saved before the Postgres sync existed have no delete queues.
      pendingDeletes: Array.isArray(parsed.pendingDeletes)
        ? parsed.pendingDeletes
        : [],
      pendingWaterDeletes: Array.isArray(parsed.pendingWaterDeletes)
        ? parsed.pendingWaterDeletes
        : [],
    };
  } catch (error) {
    console.warn('NourishTrack: failed to load day', error);
    return emptyDay();
  }
}

// Saves one day's data as a JSON string.
export async function saveDay(dateKey, data) {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + dateKey, JSON.stringify(data));
  } catch (error) {
    console.warn('NourishTrack: failed to save day', error);
  }
}
