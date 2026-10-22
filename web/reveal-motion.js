export const REVEAL_DURATION_MS = 1900;
/** Start and arrive gently; both endpoint velocities are zero. */
export function glide(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
