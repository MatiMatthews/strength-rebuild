import { addTime, pauseTimer, remainingSeconds, resetTimer, restoreTimer, resumeTimer, startTimer } from './rest-timer';

describe('rest timer', () => {
  it('supports presets, pause, resume, add, and reset with a fake clock', () => {
    let timer = startTimer(90, 1_000);
    expect(remainingSeconds(timer, 31_000)).toBe(60);
    timer = pauseTimer(timer, 31_000);
    expect(remainingSeconds(timer, 61_000)).toBe(60);
    timer = startTimer(timer.remainingSeconds, 61_000);
    timer = addTime(timer, 30, 71_000);
    expect(remainingSeconds(timer, 71_000)).toBe(80);
    expect(resetTimer()).toEqual({ durationSeconds: 0, remainingSeconds: 0, runningSince: null });
  });

  it('restores a running timer as paused after reconciling process downtime', () => {
    const persisted = startTimer(120, 1_000);
    expect(restoreTimer(persisted, 91_000)).toMatchObject({ remainingSeconds: 30, runningSince: null });
  });

  it('keeps a running deadline across repeated resumes without resetting elapsed time', () => {
    const original = startTimer(120, 1_000);
    const resumed = resumeTimer(original, 31_000);
    expect(resumed).toEqual(original);
    expect(remainingSeconds(resumeTimer(resumed, 61_000), 61_000)).toBe(60);
    expect(resumeTimer(original, 180_000)).toMatchObject({ remainingSeconds: 0, runningSince: null });
    expect(resumeTimer(pauseTimer(original, 31_000), 180_000)).toMatchObject({ remainingSeconds: 90, runningSince: null });
  });

  it('never adds rest when the wall clock moves backwards and expires old deadlines', () => {
    const timer = startTimer(90, 10_000);
    expect(remainingSeconds(timer, 5_000)).toBe(90);
    expect(resumeTimer(timer, 10_000 + 86_400_001)).toMatchObject({ remainingSeconds: 0, runningSince: null });
  });
});
