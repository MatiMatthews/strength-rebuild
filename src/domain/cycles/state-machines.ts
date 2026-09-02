export type TransitionRejectionReason =
  | 'CALENDAR_ONLY_ADVANCE_FORBIDDEN'
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'INVALID_TRANSITION'
  | 'READINESS_NOT_CLEARED'
  | 'REVIEW_NOT_RESOLVED'
  | 'TERMINAL_STATE';

export type TransitionResult<State> =
  | { accepted: true; state: State }
  | { accepted: false; state: State; reason: TransitionRejectionReason };

const accepted = <State>(state: State): TransitionResult<State> => ({ accepted: true, state });
const rejected = <State>(state: State, reason: TransitionRejectionReason): TransitionResult<State> =>
  ({ accepted: false, state, reason });

export type CycleState =
  | 'DRAFT'
  | 'READY'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REENTRY'
  | 'TRANSITION'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED';

export type CycleEvent =
  | { type: 'MARK_READY' }
  | { type: 'ACTIVATE' }
  | { type: 'PAUSE' }
  | { type: 'REQUIRE_REVIEW' }
  | { type: 'FINISH_LOADING'; nextCycleDiffers: boolean }
  | { type: 'RESUME'; daysWithoutStrengthTraining: number }
  | { type: 'COMPLETE_REENTRY'; confirmed: boolean }
  | { type: 'COMPLETE_TRANSITION'; confirmed: boolean }
  | { type: 'RESOLVE_REVIEW'; approvedState: 'READY' | 'PAUSED' }
  | { type: 'COMPLETE_WITHOUT_NEXT_CYCLE'; confirmed: boolean }
  | { type: 'CALENDAR_ELAPSED' };

export function reduceCycle(state: CycleState, event: CycleEvent): TransitionResult<CycleState> {
  if (state === 'COMPLETED') return rejected(state, 'TERMINAL_STATE');
  if (event.type === 'CALENDAR_ELAPSED') return rejected(state, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN');

  switch (state) {
    case 'DRAFT':
      return event.type === 'MARK_READY' ? accepted('READY') : rejected(state, 'INVALID_TRANSITION');
    case 'READY':
      if (event.type === 'ACTIVATE') return accepted('ACTIVE');
      if (event.type === 'COMPLETE_WITHOUT_NEXT_CYCLE') {
        return event.confirmed ? accepted('COMPLETED') : rejected(state, 'CONFIRMATION_REQUIRED');
      }
      return rejected(state, 'INVALID_TRANSITION');
    case 'ACTIVE':
      if (event.type === 'PAUSE') return accepted('PAUSED');
      if (event.type === 'REQUIRE_REVIEW') return accepted('REVIEW_REQUIRED');
      if (event.type === 'FINISH_LOADING') return accepted(event.nextCycleDiffers ? 'TRANSITION' : 'COMPLETED');
      return rejected(state, 'INVALID_TRANSITION');
    case 'PAUSED':
      if (event.type !== 'RESUME') return rejected(state, 'INVALID_TRANSITION');
      if (!Number.isInteger(event.daysWithoutStrengthTraining) || event.daysWithoutStrengthTraining < 0) {
        return rejected(state, 'INVALID_INPUT');
      }
      return accepted(event.daysWithoutStrengthTraining >= 14 ? 'REENTRY' : 'READY');
    case 'REENTRY':
      if (event.type !== 'COMPLETE_REENTRY') return rejected(state, 'INVALID_TRANSITION');
      return event.confirmed ? accepted('READY') : rejected(state, 'CONFIRMATION_REQUIRED');
    case 'TRANSITION':
      if (event.type !== 'COMPLETE_TRANSITION') return rejected(state, 'INVALID_TRANSITION');
      return event.confirmed ? accepted('READY') : rejected(state, 'CONFIRMATION_REQUIRED');
    case 'REVIEW_REQUIRED':
      return event.type === 'RESOLVE_REVIEW'
        ? accepted(event.approvedState)
        : rejected(state, 'INVALID_TRANSITION');
  }
}

export type WeekState = 'PLANNED' | 'ACTIVE' | 'REVIEW' | 'REPEATED' | 'REVIEW_REQUIRED' | 'COMPLETED';

export type WeekEvent =
  | { type: 'START' }
  | { type: 'SUBMIT_FOR_REVIEW' }
  | { type: 'CONFIRM_COMPLETION'; confirmed: boolean }
  | { type: 'REPEAT'; confirmed: boolean }
  | { type: 'REQUIRE_REVIEW' }
  | { type: 'PLAN_REPEAT' }
  | { type: 'RESOLVE_REVIEW'; repeat: boolean }
  | { type: 'CALENDAR_ELAPSED' };

export function reduceWeek(state: WeekState, event: WeekEvent): TransitionResult<WeekState> {
  if (state === 'COMPLETED') return rejected(state, 'TERMINAL_STATE');
  if (event.type === 'CALENDAR_ELAPSED') return rejected(state, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN');

  switch (state) {
    case 'PLANNED':
      return event.type === 'START' ? accepted('ACTIVE') : rejected(state, 'INVALID_TRANSITION');
    case 'ACTIVE':
      return event.type === 'SUBMIT_FOR_REVIEW' ? accepted('REVIEW') : rejected(state, 'INVALID_TRANSITION');
    case 'REVIEW':
      if (event.type === 'CONFIRM_COMPLETION') {
        return event.confirmed ? accepted('COMPLETED') : rejected(state, 'CONFIRMATION_REQUIRED');
      }
      if (event.type === 'REPEAT') {
        return event.confirmed ? accepted('REPEATED') : rejected(state, 'CONFIRMATION_REQUIRED');
      }
      return event.type === 'REQUIRE_REVIEW' ? accepted('REVIEW_REQUIRED') : rejected(state, 'INVALID_TRANSITION');
    case 'REPEATED':
      return event.type === 'PLAN_REPEAT' ? accepted('PLANNED') : rejected(state, 'INVALID_TRANSITION');
    case 'REVIEW_REQUIRED':
      return event.type === 'RESOLVE_REVIEW'
        ? accepted(event.repeat ? 'REPEATED' : 'REVIEW')
        : rejected(state, 'INVALID_TRANSITION');
  }
}

export type SessionState =
  | 'PLANNED'
  | 'READINESS_GATE'
  | 'IN_PROGRESS'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'MODIFIED'
  | 'ABORTED';

export type SessionEvent =
  | { type: 'BEGIN_READINESS' }
  | { type: 'START'; cleared: boolean }
  | { type: 'REQUIRE_REVIEW' }
  | { type: 'COMPLETE'; modified: boolean }
  | { type: 'ABORT' }
  | { type: 'RETURN_TO_READINESS'; resolved: boolean }
  | { type: 'CALENDAR_ELAPSED' };

export function reduceSession(state: SessionState, event: SessionEvent): TransitionResult<SessionState> {
  if (state === 'COMPLETED' || state === 'MODIFIED' || state === 'ABORTED') {
    return rejected(state, 'TERMINAL_STATE');
  }
  if (event.type === 'CALENDAR_ELAPSED') return rejected(state, 'CALENDAR_ONLY_ADVANCE_FORBIDDEN');

  switch (state) {
    case 'PLANNED':
      return event.type === 'BEGIN_READINESS' ? accepted('READINESS_GATE') : rejected(state, 'INVALID_TRANSITION');
    case 'READINESS_GATE':
      if (event.type === 'START') {
        return event.cleared ? accepted('IN_PROGRESS') : rejected(state, 'READINESS_NOT_CLEARED');
      }
      return event.type === 'REQUIRE_REVIEW' ? accepted('REVIEW_REQUIRED') : rejected(state, 'INVALID_TRANSITION');
    case 'IN_PROGRESS':
      if (event.type === 'COMPLETE') return accepted(event.modified ? 'MODIFIED' : 'COMPLETED');
      return event.type === 'ABORT' ? accepted('ABORTED') : rejected(state, 'INVALID_TRANSITION');
    case 'REVIEW_REQUIRED':
      if (event.type !== 'RETURN_TO_READINESS') return rejected(state, 'INVALID_TRANSITION');
      return event.resolved ? accepted('READINESS_GATE') : rejected(state, 'REVIEW_NOT_RESOLVED');
  }
}
