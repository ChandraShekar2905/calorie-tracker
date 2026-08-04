// Template for config.js — copy this file to config.js and fill it in.
// config.js is gitignored so the real key never gets committed.

// Get a key at https://aistudio.google.com/ → "Get API key".
export const GEMINI_API_KEY = 'PASTE_YOUR_GEMINI_API_KEY_HERE';

// Which Gemini model to use for meal analysis. Free tier allows
// 5 requests/minute and 20 requests/day PER MODEL, so switching
// models is also a way to get a fresh daily quota.
// Note: "gemini-2.5-flash" is retired for newly created API keys
// (returns 404 "no longer available to new users") — verified 2026-08-04.
export const GEMINI_MODEL = 'gemini-3.6-flash';
