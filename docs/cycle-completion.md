# Confirming a cycle change

After every scheduled week has reached its terminal session states and completed
weekly review, Today and Plan offer **Revisar siguiente ciclo**. The preview names
the current and next stage. Cancel changes nothing; confirmation records one
atomic decision and activates only the next ready cycle in the same plan.

A transition is a real week of lower-demand sessions, followed by weekly review.
It cannot be skipped because time passed or an earlier week was reviewed. A
second confirmation activates the next loading cycle. The final cycle can close
without creating another plan automatically.

Active safety restrictions, an open workout, unfinished weeks and mandatory
pending decisions prevent advancement. Optional session recommendations remain
optional. A changed plan must be reviewed again. Failed writes keep the preview
available for retry and roll back both cycle statuses and the audit entry.
Original prescriptions, completed workouts and preferences are preserved.

The production browser journey reviews a synthetic final week, cancels and
reopens, enters transition, completes its three accelerated workouts and review,
then confirms and starts the next loading cycle. Independent SQLite checks cover
preservation, incomplete weeks, safety restrictions and failed writes. Service
checks additionally cover stale state, duplicate/concurrent confirmation,
rollback/retry and rejection of an arbitrary successor.
