const { withAndroidStyles } = require('expo/config-plugins');

module.exports = function withAndroidLintCompatibility(config) {
  return withAndroidStyles(config, (androidConfig) => {
    const styles = androidConfig.modResults.resources.style ?? [];

    for (const style of styles) {
      if (style.$?.name !== 'Theme.App.SplashScreen') continue;

      const splashBehavior = style.item?.find(
        (item) => item.$?.name === 'android:windowSplashScreenBehavior',
      );
      if (splashBehavior?.$) splashBehavior.$['tools:targetApi'] = '33';
    }

    return androidConfig;
  });
};
