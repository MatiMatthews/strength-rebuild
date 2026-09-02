export interface RestTimerState { durationSeconds: number; remainingSeconds: number; runningSince: number | null }

export const resetTimer = (): RestTimerState => ({ durationSeconds: 0, remainingSeconds: 0, runningSince: null });
export const remainingSeconds = (timer: RestTimerState, now: number) => timer.runningSince === null
  ? timer.remainingSeconds
  : Math.max(0, timer.remainingSeconds - Math.floor((now - timer.runningSince) / 1000));
export const startTimer = (seconds: number, now: number): RestTimerState => ({ durationSeconds: seconds, remainingSeconds: seconds, runningSince: now });
export const pauseTimer = (timer: RestTimerState, now: number): RestTimerState => ({ ...timer, remainingSeconds: remainingSeconds(timer, now), runningSince: null });
export const addTime = (timer: RestTimerState, seconds: number, now: number): RestTimerState => {
  const remaining = remainingSeconds(timer, now) + seconds;
  return { durationSeconds: timer.durationSeconds + seconds, remainingSeconds: remaining, runningSince: timer.runningSince === null ? null : now };
};
// A restored timer is paused at the value implied by its persisted monotonic deadline.
export const restoreTimer = (timer?: RestTimerState, now = Date.now()): RestTimerState => timer
  ? { ...timer, remainingSeconds: remainingSeconds(timer, now), runningSince: null }
  : resetTimer();
