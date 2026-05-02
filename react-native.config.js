// ============================================================
//  react-native.config.js — RN CLI autolinking config
//
//  Currently a no-op (default autolinking applies to all
//  platforms). Earlier today this file excluded
//  @react-native-firebase/app + /messaging from iOS to clean up
//  the "FirebaseApp.configure() not called" warning. That
//  exclusion broke Android autolinking — it caused
//  ReactNativeFirebaseAppPackage to be referenced in the
//  generated PackageList.java but the actual Java class wasn't
//  on the Android classpath, so :app:compileReleaseJavaWithJavac
//  failed.
//
//  The iOS Firebase warning is harmless (Firebase iOS SDK is
//  loaded but unused; we use PushKit + APNS for iOS push). The
//  cost of fighting it via this file is too high.
//
//  Better long-term fix (v1.1): exclude Firebase iOS pods at the
//  Podfile level instead of via RN CLI autolinking. Until then
//  we accept the log noise on iOS to keep Android building.
// ============================================================

module.exports = {};
