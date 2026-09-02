import { addTime, pauseTimer, remainingSeconds, resetTimer, restoreTimer, startTimer } from './rest-timer';

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
});
