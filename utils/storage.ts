import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DayData, FoodEntry, WaterEntry } from '../types';

// All of a day's data lives under one key, e.g. "nourishtrack:2026-08-04".
// A new date means a new key, so each day starts fresh while history stays saved.
const KEY_PREFIX = 'nourishtrack:';

// Today's date as YYYY-MM-DD in the device's local timezone.
export function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A function, not a shared constant, so no two callers can ever end up
// holding the same arrays.
function emptyDay(): DayData {
  return { foods: [], water: [], pendingDeletes: [], pendingWaterDeletes: [] };
}

// Water used to be stored as bare numbers ([8, 16]). Each entry now needs an
// id and a timestamp so it can be saved to and deleted from Postgres, so
// older days are converted as they're read. Their real times are gone, so
// they get midday local — far enough from midnight that no timezone shift
// can drag them into the wrong day. They're marked unsynced, which means an
// old day opened after this change will back-fill itself into the database.
function normalizeWater(saved: unknown, dateKey: string): WaterEntry[] {
  if (!Array.isArray(saved)) {
    return [];
  }
  return saved.map((entry, index) => {
    if (typeof entry !== 'number') {
      return entry as WaterEntry;
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

// Anything read back from storage was written by an older version of this
// app, so it's `unknown` until checked. These helpers keep a corrupt or
// outdated record from taking the whole screen down.
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Loads one day's data. Returns an empty day if nothing is saved
// or if anything goes wrong reading/parsing.
export async function loadDay(dateKey: string): Promise<DayData> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + dateKey);
    if (raw === null) {
      return emptyDay();
    }
    const parsed: unknown = JSON.parse(raw);
    const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      foods: asArray<FoodEntry>(record.foods),
      water: normalizeWater(record.water, dateKey),
      // Days saved before the Postgres sync existed have no delete queues.
      pendingDeletes: asArray<string>(record.pendingDeletes),
      pendingWaterDeletes: asArray<string>(record.pendingWaterDeletes),
    };
  } catch (error) {
    console.warn('NourishTrack: failed to load day', error);
    return emptyDay();
  }
}

// Saves one day's data as a JSON string.
export async function saveDay(dateKey: string, data: DayData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + dateKey, JSON.stringify(data));
  } catch (error) {
    console.warn('NourishTrack: failed to save day', error);
  }
}
