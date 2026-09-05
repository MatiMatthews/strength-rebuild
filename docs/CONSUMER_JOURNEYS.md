# Production browser journeys

Use Node 24.11.1–24.x, npm 11.6.2–11.x and installed Google Chrome. Run
`npm ci`, then `npm run test:journeys`. The lock pins Playwright 1.62.1;
`npm run check` includes deterministic installed Expo compatibility, unit and
integration tests, advisory checks, and production web export.

The journey command clears Metro caches, builds a fresh production export and owns a loopback server
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

`npm run test:journeys:mutations` runs the fault proofs described below, then
requires all unmodified consumer journeys to pass. Future accepted consumer behaviors
accumulate in the mandatory command; unresolved witnesses stay separate.

## Session recommendations and next workout

The cumulative `session-review.spec.ts` completes Monday through production controls,
resolves accept, keep and reject in separate browser contexts, reloads the app and
enters Wednesday. Independent SQLite readback verifies the decision and preserved
completed work; keep/reject also preserve every future prescription. Ordinary
recommendations remain optional and discoverable. Weekly review remains separate.
`npm run test:journeys:witness:next-workout` retains the focused continuity diagnostic.

The service integration tests cover legacy pending rows, malformed-context safe exits,
stale acceptance, duplicate decisions, rollback on audit failure, the actual future
workout target, and continued readiness/weekly blocking. Acceptance only changes the
next unstarted matching exercise role with the same prescription. A legacy-repaired
snapshot, ambiguous match or unavailable context gets an explicit unchanged-plan exit.

The requirement activation journey selects exact bench press, horizontal push and
power through Settings, creates a named preview, then independently reads every
stored session for the three resolved requirement kinds and valid rep/set targets.
Activation and a new browser page must preserve the exact template and session
prescriptions. This browser coverage does not replace native or legacy-repair acceptance.

## Mutation coverage

The proof command now makes one disposable source/export copy per fault and
uses a new synthetic browser context each time. It shares installed dependencies
read-only by symlink, removes only its own temporary copies, and retains failing
assertions in `test-results/fault-proofs/`. Route blocking and memory-only SQLite
remain negative controls. Additional source mutations independently corrupt
saved load, reps, note and disposition; restored load, reps, note and completion;
and restored workout identity. The same unmodified smoke must fail at the
specified consumer or independent persistence assertion, not at export/setup.
The command finally reruns the unchanged baseline and writes a proof summary.
Catalog fault proofs independently bypass equipment compatibility, ignore the
impact restriction, and erase requirement field identity. Each must fail the
matching production settings assertion. Run only this bounded group with
`npm run test:journeys:mutations -- --catalog`; it still finishes with the full
unmodified journey suite. Its summary is `catalog-proof-summary.json`, separate
from the complete matrix summary. Existing persistence faults run only the smoke
so a second journey failure cannot obscure their expected failure count.
No fault switch is shipped in application code.

The matrix below tracks product acceptance, not release approval. Browser visual
proof means inspected production Chrome captures plus functional assertions;
persistence proof means independent canonical SQLite readback after reopening,
with migration checks when storage changes. Native proof means actual Android
interaction and process recreation where specified, not a web viewport alone.
“Pending” does not claim the behavior is absent; it means this inventory has no
accepted end-to-end repair proof yet.

| Consumer outcome | Status | Required behavior and evidence |
| --- | --- | --- |
| Reproducible consumer gates | Combined browser baseline accepted | Fresh locked install/check; production plan/set/reopen, SQLite readback, inspected Chrome captures, all 11 targeted faults detected and separate next-workout red witness. Native and future product outcomes remain pending below. |
| Valid exercise requirements | Pending | Exact/pattern/capability resolve catalog IDs; equipment/restriction negatives; visible invalid-input recovery; preview and stored IDs, preserve completed legacy records. |
| Next workout after review | Ordinary session decisions covered; mandatory review recovery pending | Finish first session, reach and persist accept/keep/reject decisions, reopen into next session; genuine safety block remains; Chrome and proposal/session readback. |
| Weekly and cycle transitions | Pending | Full week/cycle via UI; correct week/status, future-only targets, keep/reject negatives, explicit next cycle and deload; reopen and SQLite at transitions. |
| Reversible set changes | Pending | Cancel omission leaves values/counts/storage unchanged; confirmed reason once; delete confirmation and exact undo; double-submit negatives; Chrome and reopened SQLite. |
| Corrected history and units | Pending | Any-set correction with immutable original/audit; 60×8 + 60×8 corrected to 55×8 + 60×8 = 920 kg volume; kg/lb boundary conversion, legacy migration idempotence; effective UI/SQLite readback. |
| First use and preferences | Pending | Resumable personal setup, exactly three days, real equipment/restrictions, unknown strength without invented load, isolated demo, local decimal entry; settings-to-Plan refresh and persistence. |
| Athlete visual system | Pending | Chartreuse/ink/paper, Barlow/Lucide, compact bands and geometry; light/dark semantic contrast including success/warning/disabled; Chrome screen comparison, compatibility assertions. |
| Today and Plan continuity | Pending | Real date/week/cycle, rest versus next session, preparation and main action at 360×732; exercise-specific entry, week selection/back context, accessible controls; screen and state readback. |
| Compact workout logging | Pending | First editable row at 360×732, suitable time/per-side/bodyweight fields, active-row expansion, safety access, confirmed early finish; Android keyboard/safe-area interaction plus stored results. |
| Workout position and rest | Pending | Contextual auto-rest and timer controls; timestamp-based restoration of exercise/set/draft after navigation, background and process death; actual Android and SQLite evidence. |
| Safe exercise replacement | Pending | Real profile/history; confirmation and appropriate targets; preserve original completed work and append remaining alternative; no blind load transfer; restriction/equipment/empty-result negatives, SQLite attribution. |
| Offline exercise guides | Pending | Complete start/end body/equipment, cues/errors, correct catalog mapping and alt text; redistributable media provenance; offline screens and contact sheet for human technique/clarity review. |
| Useful Progress and history | Pending | Dated trends, completed/planned adherence, relevant exercise detail/filter, meaningful empty/partial/multi-cycle states; effective corrections/units in rows/charts, independent aggregate readback. |
| Encrypted backup files | Pending | Android share/save and picker, preview then explicit restore; cancel/wrong-password/corruption/schema negatives leave DB intact; correction/unit roundtrip and offline file evidence. |
| Accessibility and feedback | Pending | Semantics/H1/names/focus, meaningful titles, large fonts without clipping, async duplicate/error recovery, reduced motion/optional haptics; Chrome accessibility and actual Android settings/interaction. |
| Integrated Android journeys | Pending | Fresh setup through full week/cycle, correction and backup; lowest supported plus modern API; offline/light/dark/keyboard/font/safe-area/motion/navigation and restart SQLite readback; no unresolved severe defects counted green. |
| Release candidate artifact | Pending | Verified build SHA/package/version/APK hash/certificate fingerprint; offline install and in-place upgrade with history/active workout preserved; final native/backup reruns; physical-phone and publication decisions remain human. |

When a repair is accepted, move its normal desired-behavior witness into the
mandatory `*.spec.ts` suite (removing the separate command if redundant), include
positive, negative and persistence assertions, update this inventory, and rerun
`npm run check` plus `npm run test:journeys` on a fresh checkout. Do not add
`test.fail`, skips, inverted defect assertions or a separate “green” bypass.
The combined baseline acceptance must be rerun even after its individual parts
have passed. Native and human evidence cannot be inferred from the common web
command.

Wholly unstarted legacy plans can explicitly confirm a compatible replacement, retain the original in an auditable decision, and activate the effective prescription. The cumulative Chrome journey covers cancellation, confirmation, activation and cold workout reopen; SQLite tests also cover stale settings/work, rollback, repeated confirmation and encrypted backup restore. Used cycles remain read-only pending future-session repair support.
