# Existing workout load units

History, corrections, analytics and resumed workouts use kilograms until the
preference-aware input/display flow is available. Changing current settings does
not reinterpret stored numbers.

The read projection applies this precedence:

1. A set's explicit `loadUnit` (`kg` or `lb`) wins. Unknown explicit units and
   malformed numeric loads are rejected while preserving the source.
2. A unitless set may use its saved prescription when exercise identity,
   block role (where present), set range and unchanged load match uniquely.
   Generated reference provenance must use the known exercise/reference pair,
   and its percentage/increment arithmetic must reproduce the prescribed load.
   Replaced movements, ambiguous identities and edited values are not evidence.
3. Remaining unitless legacy values retain the application's historical kg
   semantics. Empty loads stay empty; they are not invented zero-load records.

Pounds use the exact 0.45359237 kg conversion factor. Projected pound values carry
`loadUnit: kg`, preventing repeated conversion. No migration rewrites the saved
prescription, actual snapshot, set log or correction event. Read-only reopen and
unchanged autosave retain original snapshot bytes and timestamps; unchanged
saves still check the canonical preparation/restriction guard. A deliberate edit
persists the current active draft with its explicit canonical unit.

Correction events are applied in their existing deterministic order after source
projection. Existing unitless correction values retain kg semantics (the legacy
editor's contract); explicitly typed correction values are converted on read.
New corrections record kg explicitly. Original history and event bytes remain
unchanged. Deleted-set undo uses the same projection as the resumed workout.

The encrypted restore validation boundary is separate from this local read
projection. A read error never deletes or repairs the original database.
