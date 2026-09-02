# Portable backup privacy

Strength Rebuild exports new portable backups using authenticated encryption.
The portable password is supplied by the user, is not stored by the app, and is
required again to inspect or restore the backup after a restart. Losing it makes
the backup unrecoverable.

Authentication, decryption, resource limits, schema checks, and relationship
checks complete before local SQLite data is changed. The replacement itself is
one transaction; a write failure rolls back the complete restore.

Older JSON and compressed backup formats are legacy, unprotected inputs. They
require a separate informed confirmation before restore. Compression only makes
data smaller; it is not encryption and provides no confidentiality or tamper
protection. Keep every backup private and transfer it only through a channel you
trust.
