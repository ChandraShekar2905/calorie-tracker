// Shared design tokens and app-wide constants.

import type { Confidence } from './types';

export const colors = {
  background: '#F3F6F1', // soft, slightly green off-white
  card: '#FFFFFF',
  accent: '#4C9A5F', // warm green
  accentSoft: '#E2F0E5',
  text: '#1F2A20',
  textMuted: '#7A8578',
  border: '#E4E9E2',
};

export const WATER_GOAL_OZ = 64;

// Dot colors for the AI's per-item confidence level. Typed as a total
// mapping, so adding a confidence level to the contract fails the build here
// until a color is chosen for it.
export const confidenceColors: Record<Confidence, string> = {
  high: '#4C9A5F', // green — same as the accent
  medium: '#E0A93E', // yellow
  low: '#9AA398', // gray
};
