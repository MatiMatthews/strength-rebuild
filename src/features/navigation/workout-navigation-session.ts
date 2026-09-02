let opened = false;

export function markWorkoutNavigation() { opened = true; }
export function wasWorkoutOpenedInThisProcess() { return opened; }
