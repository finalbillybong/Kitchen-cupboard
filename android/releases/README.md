# Android 1.1.0 build status

Prebuilt APKs have been removed from this repository's current branch. Build from the `android/` source after configuring `APP_URL` and `APP_HOST` in `MainActivity.java` for your own installation.

The 1.1.0 source (version code 3) includes camera/gallery file selection and authenticated export saving. It supports Android 8+ and targets Android 15.

**Updates to existing installations require the original signing key.** The previously distributed 1.0.1 and development 1.1.0 builds used different signing certificates and could not update each other in place.

The build accepts `KC_ANDROID_KEYSTORE`, `KC_ANDROID_KEY_ALIAS`, `KC_ANDROID_STORE_PASSWORD` and `KC_ANDROID_KEY_PASSWORD` through environment variables. Supply these privately, then run `./gradlew assembleDebug` with Java 17 and Android SDK 35. No signing secret is stored in the repository.

The app and instrumentation APKs compile. Native instrumentation execution is pending: official emulator versions 37.1.11 and 35.6.11 both segfaulted while booting on this host, including alternate graphics and software-CPU configurations. These failures occurred before the app launched. No physical Android device was connected.

`FileHandlingTest` exercises ordered multiple-gallery results, camera content-URI fallback and writing authenticated export bytes through Android's document picker. Run `./gradlew connectedDebugAndroidTest` on a working disposable emulator/device before claiming native runtime verification.

Chromium/Firefox browser tests separately cover authenticated recipe downloads, recipe editing/scaling, reviewed planner/grocery operations and offline viewing/replay.
