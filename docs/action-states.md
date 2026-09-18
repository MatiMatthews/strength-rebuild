# Training actions

Both primitive entrypoints share the same opaque foreground, background and boundary pairs. Disabled actions remain legible and inert; busy saves expose both native accessibility state and web `aria-busy`. Press feedback uses a stronger boundary, never reduced opacity. Brand commands retain ink/paper surfaces with theme-aware boundaries; disabled brand commands use the canonical muted pair. Rest presets are named buttons with visible boundaries.

The action inventory includes Settings save/add/remove, Today and Plan commands, readiness confirm/retry, workout completion/omission/deletion and rest, session and weekly review decisions, history correction, and backup actions. These consume ActionButton/IconButton or the brand command family. Navigation and progress retain their existing contracts. Radio/choice controls have separate selection semantics and are unchanged here.

Regression coverage measures normal/disabled pairs in both primitive paths and brand commands, checks real browser-composited labels/icons in the workout, and deliberately reintroduces bad opacity to prove detection. Save journeys delay and fail the SQLite transport, change theme while busy, attempt repeat activation, retry, reopen, and independently read the database. Safety-disabled completion remains inert. The native acceptance uses synthetic SQLite fixtures and preserves the pre-existing database.

Backup operations share a pending-operation lock and retain input after failure. Android keeps the encrypted envelope intact for preview, sharing and restore; the legacy plaintext table compressor cannot interpret an encrypted envelope. Large documents remain outside the native text editor.
