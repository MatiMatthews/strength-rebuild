export interface RestTimerState { durationSeconds: number; remainingSeconds: number; runningSince: number | null }

export const resetTimer = (): RestTimerState => ({ durationSeconds: 0, remainingSeconds: 0, runningSince: null });
export const remainingSeconds = (timer: RestTimerState, now: number) => timer.runningSince === null
  ? timer.remainingSeconds
  : Math.max(0, timer.remainingSeconds - Math.max(0, Math.floor((now - timer.runningSince) / 1000)));
export const startTimer = (seconds: number, now: number): RestTimerState => ({ durationSeconds: seconds, remainingSeconds: seconds, runningSince: now });
export const pauseTimer = (timer: RestTimerState, now: number): RestTimerState => ({ ...timer, remainingSeconds: remainingSeconds(timer, now), runningSince: null });
export const addTime = (timer: RestTimerState, seconds: number, now: number): RestTimerState => {
  const remaining = remainingSeconds(timer, now) + seconds;
  return { durationSeconds: timer.durationSeconds + seconds, remainingSeconds: remaining, runningSince: timer.runningSince === null ? null : now };
};
// Completed sessions retain a stopped value, not a live countdown.
export const restoreTimer = (timer?: RestTimerState, now = Date.now()): RestTimerState => timer
  ? { ...timer, remainingSeconds: remainingSeconds(timer, now), runningSince: null }
  : resetTimer();

/** Resume the same wall-clock deadline; elapsed background time is not new rest. */
export const resumeTimer = (timer?: RestTimerState, now = Date.now()): RestTimerState => {
  if (!timer) return resetTimer();
  if (timer.runningSince !== null && remainingSeconds(timer, now) === 0) return { ...timer, remainingSeconds: 0, runningSince: null };
  return { ...timer };
};

export function restAfterCompletion<T extends { autoRestEnabled?: boolean; restSeconds?: number; timer?: RestTimerState }>(draft: T, now: number): T {
  return draft.autoRestEnabled ? { ...draft, timer: startTimer([60, 90, 120].includes(draft.restSeconds ?? 0) ? draft.restSeconds! : 90, now) } : draft;
}
