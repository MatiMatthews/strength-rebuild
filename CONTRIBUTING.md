# Contributing

Changes should be small, test-first, and preserve offline behavior, local data, accessibility, and completed workout history.

## Development

Use the toolchain in the [README](README.md#android-support). Install dependencies with `npm ci`, then use `npm run android` for a native development build.

Before opening a pull request, run:

```sh
npm run check
```

See [Testing](docs/TESTING.md) for the individual checks and Android testing expectations.

## A useful contribution

- Describe the observed problem and the expected behavior.
- Use a small, synthetic reproduction and add a focused regression test.
- Preserve existing data and explain any migration or backup implications.
- Include screenshots for visible changes, reviewed for private information.
- State which checks passed and which platforms you did not test.

Do not commit credentials, signing material, device data, databases, real training records, or unreviewed screenshots.

Contributions are made under the project's [MIT License](LICENSE).

For vulnerabilities, follow [Security](SECURITY.md) instead of posting sensitive details in an issue. Third-party notices must remain intact; see [Third-party notices](docs/THIRD_PARTY_NOTICES.md).
