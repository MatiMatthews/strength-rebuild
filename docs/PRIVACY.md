# Privacy and data handling

Strength Rebuild is designed for local, offline use. This document describes
the current application behavior; it is not legal advice or a promise that a
device, operating system, or transfer destination is secure.

## Local storage

Training plans, sessions, readiness answers, settings, and audit records are
stored in the app's local SQLite database. SQLite is opened by the production
repository provider in `src/data/repositories/provider.tsx`. The app does not
require an account or a product-operated server for its core workflows.

Anyone with sufficient access to an unlocked or compromised device may be able
to access app data. Device access controls and operating-system protections are
outside the app's control.

## Portable backups

New portable backups are encrypted and authenticated with XChaCha20-Poly1305
using a key derived from the password supplied by the user. The password is not
stored by the app. Authentication and validation happen before the transactional
SQLite replacement. Executable coverage is in
`src/application/export/backup-envelope.test.ts`.

Older JSON and compressed formats are legacy inputs and are not confidential or
tamper-protected. More detail is in [Portable backup privacy](BACKUP_PRIVACY.md).
Keep every backup private and retain its password separately.

## Sharing

Sharing occurs only after the user activates the backup sharing control. The app
passes the complete backup to Android's system share sheet; the selected receiving
application and destination then control that copy. The production boundary is
visible in `src/features/backup/BackupPanel.tsx`. The app does not silently upload
backups, but it cannot revoke or delete copies already sent elsewhere.

## Android permissions

The tracked generated-manifest policy is
`plugins/with-secure-android-release.js`. It allowlists Internet and vibration
permissions and explicitly removes legacy external-storage read/write permissions
during deterministic prebuild. Core use remains offline. Android and bundled
framework components may use declared platform capabilities; permission
declarations alone do not imply that training data is uploaded.

Android operating-system backup and data extraction are disabled for the app.
User-created portable backups remain the supported transfer mechanism.

## Deletion and retention

Uninstalling the app removes its app-private local database under normal Android
behavior because operating-system backup and extraction are disabled. This does
not delete portable backups or copies already shared to another application,
device, or service; those must be removed at each destination.

The app has no bulk "delete all data" control. Completed training history is
preserved as an immutable record; supported corrections append audit records rather
than rewriting the original event. Users who need to remove all app-local records
must uninstall the application, understanding that recovery requires a retained
portable backup and its password.

## Limitations

The project does not claim that local storage, a device, or a transfer channel is
immune to compromise. It does not collect telemetry for the repository owner, so
there is no remote account-deletion workflow.
