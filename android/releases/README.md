# Android 1.1.0 build status

`KitchenCupboard-1.1.0.apk` is a debug development build (version code 3) with camera/gallery file selection and authenticated export saving. It supports Android 8+ and targets Android 15.

**Signing is not yet compatible with the bundled 1.0.1 installer.** The available local debug key differs from the original signing key. Do not treat this APK as an in-place update. Rebuild with the original keystore before distributing an update to existing installations.

| APK | Signing certificate SHA-256 |
|---|---|
| Bundled 1.0.1 | `ac77641a45d151ce3d7be98bc14d74e0b308e21f34cc74140ebd3ba7fb1b4967` |
| Development 1.1.0 | `77b2a33bac774904ebee7362bb67c00be2abf89acdd9ace4e9b6ced2982b6dbb` |

The build accepts `KC_ANDROID_KEYSTORE`, `KC_ANDROID_KEY_ALIAS`, `KC_ANDROID_STORE_PASSWORD` and `KC_ANDROID_KEY_PASSWORD` through environment variables. Supply these privately, then run `./gradlew assembleDebug` with Java 17 and Android SDK 35. No signing secret is stored in the repository.

The app and instrumentation APKs compile. Native instrumentation execution is pending: official emulator versions 37.1.11 and 35.6.11 both segfaulted while booting on this host, including alternate graphics and software-CPU configurations. These failures occurred before the app launched. No physical Android device was connected.

`FileHandlingTest` exercises ordered multiple-gallery results, camera content-URI fallback and writing authenticated export bytes through Android's document picker. Run `./gradlew connectedDebugAndroidTest` on a working disposable emulator/device before claiming native runtime verification.

Chromium/Firefox browser tests separately cover authenticated recipe downloads, recipe editing/scaling, reviewed planner/grocery operations and offline viewing/replay.
