# Releasing ASEF

The app is plain HTML, CSS and JavaScript in `www/`, wrapped by Capacitor for Android (`android/`) and iOS (`ios/`).

## Before every release

1. `npm install`
2. `npm test` (all tests must pass)
3. Raise the version:
   - `package.json` → `version`
   - Android: `android/app/build.gradle` → `versionCode` (+1 every upload) and `versionName`
   - iOS: in Xcode, target App → General → Version and Build
4. `npx cap sync` copies `www/` into both apps.

To change the app icon or splash screen, edit `assets/logo.svg`, re-render the PNGs in `assets/`, then run `npm run assets`.

## Android (Google Play)

You need Android Studio (it brings the Android SDK and Java).

1. Create an upload key once, and keep it and its passwords safe (losing it means asking Google to reset it):
   ```
   keytool -genkey -v -keystore asef-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias asef
   ```
   Put `asef-upload.jks` in `android/`.
2. Create `android/keystore.properties` (it is ignored by git):
   ```
   storeFile=asef-upload.jks
   storePassword=...
   keyAlias=asef
   keyPassword=...
   ```
3. Build the bundle: `cd android && ./gradlew bundleRelease`
   The file is `android/app/build/outputs/bundle/release/app-release.aab`.
4. In the Google Play Console: create the app "ASEF: Money & Wealth Tracker", upload the `.aab` to Internal testing
   first, fill in the store listing from `store/listing.md`, the Data safety form (no data collected), the content
   rating questionnaire and the privacy policy URL, then promote to Production.

Note: new personal developer accounts must run a closed test with at least 12 testers for 14 days before Production.

## iOS (App Store)

You need a Mac with Xcode and an Apple Developer account (99 USD a year).

1. `npx cap open ios`
2. In Xcode: target App → Signing & Capabilities → pick your team. The bundle ID is `io.github.aelfqier.asef`.
3. Product → Archive, then Distribute App → App Store Connect.
4. In App Store Connect: create the app, fill in the listing from `store/listing.md`, App Privacy ("Data Not
   Collected"), and the privacy policy URL, then submit for review.
