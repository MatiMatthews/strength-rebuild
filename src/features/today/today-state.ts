import type { TodayData } from '@/application/programs/program-service';

export type TodayState =
  | { kind: 'empty' }
  | { kind: 'planned'; data: TodayData }
  | { kind: 'resume'; data: TodayData }
  | { kind: 'restriction'; data: TodayData }
  | { kind: 'no-workout'; nextSessionLabel: string }
  | { kind: 'review-required' };

type TodaySignals = {
  today: TodayData | null;
  activeSession?: boolean;
  nextSessionLabel?: string;
  restrictionActive?: boolean;
  reviewRequired?: boolean;
  scheduledToday?: boolean;
};

export function deriveTodayState(signals: TodaySignals): TodayState {
  if (signals.reviewRequired) return { kind: 'review-required' };
  if (!signals.today) return { kind: 'empty' };
  if (signals.activeSession) return { kind: 'resume', data: signals.today };
  if (signals.scheduledToday === false) return { kind: 'no-workout', nextSessionLabel: signals.nextSessionLabel ?? 'Próxima sesión' };
  if (signals.restrictionActive) return { kind: 'restriction', data: signals.today };
  return { kind: 'planned', data: signals.today };
}
