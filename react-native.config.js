// ============================================================
//  react-native.config.js — RN CLI autolinking overrides
//
//  Why this file exists: VaultChat uses @react-native-firebase
//  ONLY on Android, for FCM-based push wake of the killed app.
//  iOS uses PushKit + APNS via src/services/voipPushService.js
//  and never imports Firebase. Without this override, RN CLI
//  autolinking installs the Firebase iOS pods anyway, the
//  Firebase native library compiles in, and on every launch we
//  see:
//
//    [FirebaseCore] The default Firebase app has not yet been
//    configured. Add `FirebaseApp.configure()` ...
//
//  Excluding the iOS platform from these two packages keeps the
//  warning out of the logs AND drops several MB from the iOS
//  binary. Android autolinking is untouched.
//
//  After changing this file, run `pod install` (or
//  `npx expo prebuild --clean` for managed Expo) before the
//  next iOS rebuild so the Podfile.lock reflects the change.
// ============================================================

module.exports = {
  dependencies: {
    '@react-native-firebase/app': {
      platforms: { ios: null },
    },
    '@react-native-firebase/messaging': {
      platforms: { ios: null },
    },
  },
};
