# Production browser journeys

Use Node 24.11.1–24.x, npm 11.6.2–11.x and installed Google Chrome. Run
`npm ci`, then `npm run test:journeys`. The lock pins Playwright 1.62.1;
`npm run check` includes deterministic installed Expo compatibility, unit and
integration tests, advisory checks, and production web export.

The journey command builds a fresh production export and owns a loopback server
on port 4179. It refuses to reuse an existing server. COOP/COEP headers enable
SQLite's worker and WASM. Playwright tears down the server and disposable browser
context on success or failure; no existing browser profile or user data is used.

The mandatory smoke starts empty, creates and explicitly activates the current
synthetic default plan, confirms preparation, completes one activation set with
8 repetitions and a synthetic note, closes the page, then reopens Plan and the
workout. It verifies the restored fields, completion state and workout identity.
This baseline does not certify catalog resolution or the next-session lifecycle.

Persistence is independently read from the browser's OPFS file, stripped of the
locked Expo VFS header, and opened read-only with Node SQLite. Integrity, cycles,
three sessions per week, workout identity and exact completed-set values are
asserted. Active workouts store their canonical draft in
`workout_session.actual_snapshot_json`; `set_log` is materialized on finishing.
No app service, mock, hidden route or production test hook supplies the readback.
Screenshots, the synthetic SQLite copy and JSON readback remain under ignored
`test-results/`. These are supporting evidence, not substitutes for assertions.

`npm run test:journeys:mutations` proves two negative controls against the same
smoke: aborting browser JavaScript must fail route visibility; rewriting only the
disposable context's served database name to `:memory:` must fail persisted plan
reopening. Both subprocesses must exit 1 at the expected consumer assertion, or
the proof command fails. These faults never change the exported app or source.
Run the unmodified smoke again after fault proofs. Future accepted consumer
behaviors accumulate in this mandatory command; unresolved future witnesses
must stay separate and must not be reported as passing.
