import { GEMINI_API_KEY, GEMINI_MODEL } from '../config';

// The model is chosen in config.js — see the notes there about which
// models are available on new API keys and per-model quotas.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `Identify each food item in this photo and estimate its calories.
Respond with ONLY JSON, no markdown, in exactly this shape:
{"items": [{"name": string, "portion": string, "calories": number, "confidence": "high" | "medium" | "low"}], "total_calories": number}
If the photo contains no food, return {"items": [], "total_calories": 0}.`;

// A 429 body carries a google.rpc.RetryInfo detail like
// {"retryDelay": "42s"} (shape verified against a real response).
// Falls back to the "Please retry in Ns" message text, then to 60s.
function parseRetryDelay(errorBody) {
  try {
    const errorInfo = JSON.parse(errorBody).error || {};
    for (const detail of errorInfo.details || []) {
      if (typeof detail.retryDelay === 'string') {
        const seconds = parseFloat(detail.retryDelay);
        if (seconds > 0) {
          return Math.ceil(seconds);
        }
      }
    }
    const match = /retry in ([\d.]+)s/i.exec(errorInfo.message || '');
    if (match) {
      return Math.ceil(parseFloat(match[1]));
    }
  } catch (parseError) {
    // Unparseable body — use the fallback below.
  }
  return 60;
}

// Models sometimes wrap JSON in ```json fences even when told not to.
function stripCodeFences(text) {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// The free tier allows only 5 requests/minute and 20 requests/day per
// model, so nothing in this file retries automatically — every request
// is user-initiated via the UI's Retry button. (The API also
// intermittently rejects valid requests with a generic 400, so that
// button genuinely matters.)

// Sends the photo to Gemini and returns { items } with a cleaned-up,
// UI-safe items array. Throws on any failure; a rate-limit (429) error
// carries isRateLimit and retryAfterSeconds so the UI can show a countdown.
export async function analyzeMealPhoto(base64, mimeType) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    // Read and log the full error body — Gemini's JSON error messages
    // explain the real cause (e.g. model retired, invalid argument),
    // which a bare status code never would.
    const errorBody = await response.text();
    console.warn('NourishTrack: Gemini error response', errorBody);
    const error = new Error(
      `Gemini request failed with status ${response.status}`
    );
    if (response.status === 429) {
      error.isRateLimit = true;
      error.retryAfterSeconds = parseRetryDelay(errorBody);
    }
    throw error;
  }

  const data = await response.json();

  // The reply text lives at candidates[0].content.parts[].text.
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || '').join('');
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (error) {
    throw new Error('Could not parse the model response as JSON');
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error('Model response is missing the items array');
  }

  // Sanitize every field so a slightly-off response can't break the UI.
  // The total is recomputed in the UI from the items, so we ignore
  // total_calories rather than trusting the model's arithmetic.
  const items = parsed.items.map((item) => ({
    name: String(item.name || 'Unknown item'),
    portion: String(item.portion || ''),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    confidence: ['high', 'medium', 'low'].includes(item.confidence)
      ? item.confidence
      : 'low',
  }));

  return { items };
}
