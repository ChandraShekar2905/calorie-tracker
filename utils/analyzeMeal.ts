import { GEMINI_API_KEY, GEMINI_MODEL } from '../config';
import type { AnalyzedItem, Confidence } from '../types';

// The model is chosen in config.ts — see the notes there about which
// models are available on new API keys and per-model quotas.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `Identify each food item in this photo and estimate its calories.
Respond with ONLY JSON, no markdown, in exactly this shape:
{"items": [{"name": string, "portion": string, "calories": number, "confidence": "high" | "medium" | "low"}], "total_calories": number}
If the photo contains no food, return {"items": [], "total_calories": 0}.`;

// Carries the rate-limit details the UI needs for its countdown. A class
// rather than extra properties bolted onto a plain Error, because TypeScript
// types a caught value as `unknown` — the UI has to narrow it with
// `instanceof` before reading anything, which also means an unrelated
// failure can no longer be mistaken for a rate limit.
export class MealAnalysisError extends Error {
  isRateLimit: boolean;
  retryAfterSeconds: number;

  constructor(
    message: string,
    options: { isRateLimit?: boolean; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = 'MealAnalysisError';
    this.isRateLimit = options.isRateLimit ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 0;
  }
}

// The documented shape of a Gemini reply. Everything is optional and the
// reader below tolerates all of it being absent, so an unexpected response
// degrades into the "empty response" error rather than a crash.
type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConfidence(value: unknown): value is Confidence {
  return value === 'high' || value === 'medium' || value === 'low';
}

// A 429 body carries a google.rpc.RetryInfo detail like
// {"retryDelay": "42s"} (shape verified against a real response).
// Falls back to the "Please retry in Ns" message text, then to 60s.
function parseRetryDelay(errorBody: string): number {
  try {
    const parsed: unknown = JSON.parse(errorBody);
    const errorInfo = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : {};
    const details = Array.isArray(errorInfo.details) ? errorInfo.details : [];
    for (const detail of details) {
      if (isRecord(detail) && typeof detail.retryDelay === 'string') {
        const seconds = parseFloat(detail.retryDelay);
        if (seconds > 0) {
          return Math.ceil(seconds);
        }
      }
    }
    const message = typeof errorInfo.message === 'string' ? errorInfo.message : '';
    const match = /retry in ([\d.]+)s/i.exec(message);
    if (match) {
      return Math.ceil(parseFloat(match[1]));
    }
  } catch (parseError) {
    // Unparseable body — use the fallback below.
  }
  return 60;
}

// Models sometimes wrap JSON in ```json fences even when told not to.
function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// Turns one unvalidated entry from the model into a UI-safe item. This is a
// runtime check, not a cast: the returned type is earned by the coercions
// below, so a malformed response can't reach the UI claiming to be valid.
function toAnalyzedItem(raw: unknown): AnalyzedItem {
  const item = isRecord(raw) ? raw : {};
  return {
    name: String(item.name || 'Unknown item'),
    portion: String(item.portion || ''),
    calories: Math.max(0, Math.round(Number(item.calories) || 0)),
    confidence: isConfidence(item.confidence) ? item.confidence : 'low',
  };
}

// The free tier allows only 5 requests/minute and 20 requests/day per
// model, so nothing in this file retries automatically — every request
// is user-initiated via the UI's Retry button. (The API also
// intermittently rejects valid requests with a generic 400, so that
// button genuinely matters.)

// Sends the photo to Gemini and returns a cleaned-up, UI-safe items array.
// Throws MealAnalysisError on any failure; a rate limit (429) carries
// isRateLimit and retryAfterSeconds so the UI can show a countdown.
export async function analyzeMealPhoto(
  base64: string,
  mimeType: string
): Promise<{ items: AnalyzedItem[] }> {
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
    throw new MealAnalysisError(
      `Gemini request failed with status ${response.status}`,
      response.status === 429
        ? { isRateLimit: true, retryAfterSeconds: parseRetryDelay(errorBody) }
        : {}
    );
  }

  const data = (await response.json()) as GeminiResponse;

  // The reply text lives at candidates[0].content.parts[].text.
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? '').join('');
  if (!text) {
    throw new MealAnalysisError('Gemini returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (error) {
    throw new MealAnalysisError('Could not parse the model response as JSON');
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new MealAnalysisError('Model response is missing the items array');
  }

  // The total is recomputed in the UI from the items, so we ignore
  // total_calories rather than trusting the model's arithmetic.
  return { items: parsed.items.map(toAnalyzedItem) };
}
