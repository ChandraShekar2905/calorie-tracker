import { API_BASE_URL } from '../config';

// If the laptop isn't reachable, fetch can hang for a long time before the
// platform gives up. Failing fast keeps the app feeling instant — a failed
// sync is harmless because the entry is already saved locally.
const TIMEOUT_MS = 6000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      throw new Error(
        `${options.method || 'GET'} ${path} failed with status ${response.status}`
      );
    }
    // DELETE replies 204 with no body.
    return response.status === 204 ? null : await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Saves a meal and its items. Safe to call twice with the same meal — the
// server upserts on id.
export function saveMeal(meal) {
  return request('/meals', { method: 'POST', body: JSON.stringify(meal) });
}

// Removes one food from a meal on the server.
export function deleteMealItem(itemId) {
  return request(`/meal-items/${itemId}`, { method: 'DELETE' });
}

// Saves one glass of water. Also safe to call twice with the same entry.
export function saveWaterEntry(entry) {
  return request('/water', { method: 'POST', body: JSON.stringify(entry) });
}

export function deleteWaterEntry(entryId) {
  return request(`/water/${entryId}`, { method: 'DELETE' });
}

// Reads a day back out of Postgres. Not used by the logging flow — these are
// here to confirm the data really landed in the database.
export function fetchMeals(dateKey) {
  return request(`/meals?date=${dateKey}`);
}

export function fetchWater(dateKey) {
  return request(`/water?date=${dateKey}`);
}
