# Third-party notices

Strength Rebuild's own code is licensed under [MIT](../LICENSE). Third-party components retain their original licenses and copyright notices.

## Fonts bundled with the source

| Font | License | Bundled notice |
| --- | --- | --- |
| Barlow | SIL Open Font License 1.1 | [OFL-Barlow.txt](../assets/fonts/OFL-Barlow.txt) |
| Barlow Condensed | SIL Open Font License 1.1 | [OFL-BarlowCondensed.txt](../assets/fonts/OFL-BarlowCondensed.txt) |

Keep these notices with the font files. A license for the application does not relicense the fonts.

## Icons and application dependencies

Lucide React Native is distributed under ISC, with additional attribution for icons derived from Feather. Its package's complete notice is available after installation at `node_modules/lucide-react-native/LICENSE` and in the [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE).

The directly declared JavaScript runtime packages in the current lockfile use MIT, except for Lucide's ISC declaration. They include React, React Native, Expo and its modules, Zustand, Zod, Noble Ciphers, Noble Hashes, and the React Native gesture, animation, screen, SVG, and web packages. This summary does not replace each package's full notice or cover every transitive or native dependency.

## Before distributing a binary

- Generate the dependency inventory from the exact lockfile and build being distributed.
- Preserve all applicable license, copyright, and attribution notices, including transitive and native dependencies.
- Review the generated software bill of materials and the signed artifact together.
- Review the provenance and rights of any additional images, video, music, or other promotional material separately.

The repository's stack badges are descriptive graphics from [Shields.io](https://shields.io/); they do not assert build status, endorsement, or ownership of third-party marks.
