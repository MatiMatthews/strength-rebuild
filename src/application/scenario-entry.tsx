import type { PropsWithChildren } from 'react';

/** Production entry: scenario fixtures are deliberately unreachable. */
export function ScenarioStateGate({ children }: PropsWithChildren) {
  return children;
}
