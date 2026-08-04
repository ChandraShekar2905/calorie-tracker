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

// Loads one day's data. Returns an empty day if nothing is saved
// or if anything goes wrong reading/parsing.
export async function loadDay(dateKey) {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + dateKey);
    if (raw === null) {
      return { foods: [], water: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      water: Array.isArray(parsed.water) ? parsed.water : [],
    };
  } catch (error) {
    console.warn('NourishTrack: failed to load day', error);
    return { foods: [], water: [] };
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
