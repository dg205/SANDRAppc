// Gates the in-app test/demo tooling (devSeed screen, signup quick-fill).
// __DEV__ alone isn't enough: eas.json's "preview" profile is a standalone
// APK built in release mode, so __DEV__ is false there even though it's an
// internal testing build. EXPO_PUBLIC_ENABLE_TEST_MODE covers that case and
// is left unset in the production build profile.
export const TEST_MODE_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_TEST_MODE === "1";
