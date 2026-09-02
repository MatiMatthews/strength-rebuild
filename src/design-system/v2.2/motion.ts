export const motionDurations = {
  press: 120,
  row: 180,
  screen: 240,
} as const;

export type MotionKind = keyof typeof motionDurations;

/** Reduced motion makes every non-essential transition immediate. */
export function motionDuration(kind: MotionKind, reducedMotion: boolean): number {
  return reducedMotion ? 0 : motionDurations[kind];
}
