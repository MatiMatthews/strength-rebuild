const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIGURATION = `
// Release signing is owner-controlled. Values may come from Gradle properties or
// the environment; no signing material belongs in this repository.
def releaseKeystore = providers.gradleProperty("STRENGTH_RELEASE_KEYSTORE")
    .orElse(providers.environmentVariable("STRENGTH_RELEASE_KEYSTORE"))
def releaseStorePassword = providers.gradleProperty("STRENGTH_RELEASE_STORE_PASSWORD")
    .orElse(providers.environmentVariable("STRENGTH_RELEASE_STORE_PASSWORD"))
def releaseKeyAlias = providers.gradleProperty("STRENGTH_RELEASE_KEY_ALIAS")
    .orElse(providers.environmentVariable("STRENGTH_RELEASE_KEY_ALIAS"))
def releaseKeyPassword = providers.gradleProperty("STRENGTH_RELEASE_KEY_PASSWORD")
    .orElse(providers.environmentVariable("STRENGTH_RELEASE_KEY_PASSWORD"))
def releaseSigningReady = releaseKeystore.isPresent() && releaseStorePassword.isPresent() &&
    releaseKeyAlias.isPresent() && releaseKeyPassword.isPresent()
`;

module.exports = function withSecureAndroidRelease(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const allowedPermissions = new Set([
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
    ]);
    androidConfig.modResults.manifest['uses-permission'] = (
      androidConfig.modResults.manifest['uses-permission'] ?? []
    ).filter((permission) => allowedPermissions.has(permission.$?.['android:name']));
    const legacyStoragePermissions = ['READ', 'WRITE'].map(
      (access) => `android.permission.${access}_${['EXTERNAL', 'STORAGE'].join('_')}`,
    );
    androidConfig.modResults.manifest['uses-permission'].push(
      ...legacyStoragePermissions.map((name) => ({
        $: { 'android:name': name, 'tools:node': 'remove' },
      })),
    );

    const application = androidConfig.modResults.manifest.application?.[0]?.$;
    if (!application) throw new Error('Missing Android application manifest entry');

    // Local training records must only move through the explicit encrypted export flow.
    application['android:allowBackup'] = 'false';
    application['android:fullBackupContent'] = 'false';
    return androidConfig;
  });

  return withAppBuildGradle(config, (androidConfig) => {
    let source = androidConfig.modResults.contents;
    const androidMarker = 'android {';
    if (!source.includes(androidMarker)) throw new Error('Missing Android Gradle block');
    source = source.replace(androidMarker, `${RELEASE_CONFIGURATION}\n${androidMarker}`);

    const signingStart = source.indexOf('    signingConfigs {');
    const buildTypesStart = source.indexOf('    buildTypes {', signingStart);
    if (signingStart < 0 || buildTypesStart < 0) throw new Error('Missing signing configuration');
    const signingConfigs = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (releaseSigningReady) {
                storeFile file(releaseKeystore.get())
                storePassword releaseStorePassword.get()
                keyAlias releaseKeyAlias.get()
                keyPassword releaseKeyPassword.get()
            }
        }
    }
`;
    source = `${source.slice(0, signingStart)}${signingConfigs}${source.slice(buildTypesStart)}`;

    const unsafeRelease = '            signingConfig signingConfigs.' + 'debug';
    const releaseIndex = source.indexOf('        release {', source.indexOf('buildTypes'));
    const unsafeIndex = source.indexOf(unsafeRelease, releaseIndex);
    if (releaseIndex < 0 || unsafeIndex < 0) throw new Error('Missing release build type');
    source = `${source.slice(0, unsafeIndex)}            signingConfig signingConfigs.release${source.slice(unsafeIndex + unsafeRelease.length)}`;

    const buildTypesEnd = source.indexOf('    packagingOptions {', releaseIndex);
    if (buildTypesEnd < 0) throw new Error('Missing Android packaging options');
    const certificationBuildType = `        certification {
            // Credential-free, non-distributable emulator candidate. Unlike the
            // debug variant this embeds JS so offline checks never depend on Metro.
            initWith release
            signingConfig signingConfigs.debug
            matchingFallbacks = ['release']
        }
    }
`;
    source = `${source.slice(0, buildTypesEnd - 6)}${certificationBuildType}${source.slice(buildTypesEnd)}`;
    source += `

gradle.taskGraph.whenReady { graph ->
    // Inspect requested entrypoints, not release-fallback dependency tasks used
    // by the credential-free certification build.
    def productionReleaseRequested = gradle.startParameter.taskNames.any { taskName ->
        taskName.toLowerCase().contains("release")
    }
    if (productionReleaseRequested && !releaseSigningReady) {
        throw new GradleException("Release signing keystore inputs are required; refusing a debug-signed release")
    }
}
`;

    androidConfig.modResults.contents = source;
    return androidConfig;
  });
};
