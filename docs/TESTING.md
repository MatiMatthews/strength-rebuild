# Testing

Use the Node and npm versions listed in the [README](../README.md#android-support). The automated checks are verified on macOS; native Android development also requires JDK 17 and the Android SDK.

```sh
npm ci
npm run check
```

The check command runs these steps in order and stops on the first failure:

| Command | Coverage |
| --- | --- |
| `npm run lint` | ESLint and React Native conventions. |
| `npm run typecheck` | Strict TypeScript validation. |
| `npm test -- --runInBand --ci` | Component and domain tests, backups, migrations, repositories, and workout workflows. |
| `npm run verify:expo-compatibility` | Installed native modules against the locked Expo SDK. |
| `npm run doctor` | Expo project health, run offline within `check`. |
| `npm run verify:advisories` | Dependency findings against the expiring advisory policy. |
| `npm run export:web` | Production web bundling. |

Tests use synthetic fixtures. SQLite integration tests use Node's built-in SQLite implementation, not a production device database.

## Android testing

`npm run android` builds and opens a native development app. Exercise plan creation, readiness, set logging, session recovery, history, and backup restore on an emulator or test device. Test migrations and upgrades using a disposable copy of data. Never use your only copy of training records.

For a release, verify the exact signed APK on a physical phone, including offline use, process restarts, keyboard interactions, accessibility settings, and an upgrade from the previous version. JavaScript tests and a successful web export do not replace this work.

## Known limitations

- The [advisory policy](../SECURITY.md#known-dependency-advisories) has temporary exceptions. Passing it does not mean that `npm audit` has no findings.
- The browser is a preview target. The web development server currently has an Expo SQLite worker-bundling limitation; the production export is checked separately.
- iOS is not a verified target. The project includes an Android-specific migration module and does not support Expo Go.
