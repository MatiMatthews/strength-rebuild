# Security

## Reporting a vulnerability

Use this repository's private security-advisory form to report a suspected vulnerability.
Do not put training records, backup contents, passwords, device identifiers, or
other private data in an issue. If a private advisory form is unavailable, open
a minimal issue asking the repository owner to enable a private reporting path;
do not include vulnerability details.

## Scope and limitations

Security reports should identify the affected version, describe reproducible
steps with synthetic data, and explain the observed impact. The project does not
offer a security guarantee, legal advice, or a compliance certification.

Local records and exported backups can contain sensitive training information.
Portable backups use authenticated encryption, but their password is supplied
and retained by the user; losing it makes the backup unrecoverable. Legacy backup
formats are not encrypted. See [Privacy and data handling](docs/PRIVACY.md) and
[portable backup details](docs/BACKUP_PRIVACY.md).

## Known dependency advisories

The current [advisory policy](security/advisory-policy.json) contains four temporary exceptions, expiring on October 1, 2026:

| Dependency | Advisory | Severity |
| --- | --- | --- |
| image-size | GHSA-5p2g-fcmc-qvqq | High |
| image-size | GHSA-w3rx-r6r6-pgpr | High |
| decode-uri-component | GHSA-vcc3-ghjq-m6fr | Moderate |
| uuid | GHSA-w5hq-g745-h8pq | Moderate |

The policy records the affected dependency paths, ownership, and current compatibility justifications. These exceptions are not fixes or proof that every application path is unaffected. In particular, the router dependency deserves review before adding externally supplied navigation input.

`npm audit` can report more affected packages because advisories propagate through the dependency tree. A passing advisory-policy check means its current exceptions are satisfied, not that the dependency tree is vulnerability-free. Recheck the exact lockfile before every release, upgrade compatible patches when available, and do not automatically extend the expiry dates.
