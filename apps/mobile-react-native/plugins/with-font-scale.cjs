const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// RN handles font-scale updates through onConfigurationChanged/onHostResume.
// Avoid recreating the Activity while Expo's image-picker launcher belongs to
// the existing React host. Keep this in prebuild source, not generated android/.
module.exports = function withFontScale(config) {
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      config.modResults,
    );
    const changes = new Set(
      (activity.$["android:configChanges"] || "").split("|").filter(Boolean),
    );
    changes.add("fontScale");
    activity.$["android:configChanges"] = [...changes].join("|");
    return config;
  });
};
