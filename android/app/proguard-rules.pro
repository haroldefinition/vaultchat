# =============================================================
#  ProGuard / R8 keep rules — task #7 (Play Store release build)
#  android/app/proguard-rules.pro
#
#  Goal: when `android.enableMinifyInReleaseBuilds=true` is set,
#  R8 strips out classes it thinks are unused. Native modules
#  reach into Java via JNI / reflection / runtime class lookup,
#  so R8 can't see those references and removes the classes —
#  causing the release build to crash on first use with errors
#  like NoSuchMethodError, ClassNotFoundException, or silent
#  no-ops where a feature appears broken.
#
#  Each block below documents WHY a particular library needs
#  keep rules so we know what to revisit if a library is ever
#  removed.
# =============================================================

# Default flags inherited from /android-sdk/.../proguard-android.txt.
# Per-project rules below.

# ── React Native core ────────────────────────────────────────
# RN bridges JS → Java via @ReactMethod-annotated methods looked
# up by name at runtime. Stripping any of them silently breaks
# arbitrary JS calls.
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }

# ── react-native-reanimated ──────────────────────────────────
# Worklets are compiled to Java classes loaded by name at runtime.
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ── react-native-callkeep (Phase AAA) ────────────────────────
# ConnectionService is bound by name in AndroidManifest.xml. The
# OS instantiates VoiceConnectionService reflectively when binding
# a self-managed PhoneAccount. Stripping it = no incoming-call UI.
-keep class io.wazo.callkeep.** { *; }
-keep class io.wazo.callkeep.VoiceConnectionService { *; }
-keep class io.wazo.callkeep.RNCallKeepBackgroundMessagingService { *; }
-dontwarn io.wazo.callkeep.**

# ── react-native-webrtc ──────────────────────────────────────
# Native libwebrtc.so calls back into Java by class name (JNI).
# These classes carry the audio/video pipeline; if R8 renames or
# removes any of them, calls connect but produce no media.
-keep class org.webrtc.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn org.webrtc.**

# ── Firebase Cloud Messaging ─────────────────────────────────
# FCM data messages wake the app via a JobIntentService whose
# class name is registered in the manifest. R8 must not rename it.
-keep class com.google.firebase.** { *; }
-keep class io.invertase.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn io.invertase.firebase.**
-dontwarn com.google.android.gms.**

# ── Notifee (notification channels) ──────────────────────────
# Notifee's foreground service + worker classes are referenced
# from notification-trampoline intents at runtime.
-keep class app.notifee.** { *; }
-keep class io.invertase.notifee.** { *; }
-dontwarn app.notifee.**

# ── OkHttp / Okio (Firebase HTTP transport, networking) ──────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn org.conscrypt.**

# ── Expo modules ─────────────────────────────────────────────
# Expo's autolinking generates module registries by package scan;
# R8 sometimes strips empty constructors that Expo needs to invoke.
-keep class expo.modules.** { *; }
-keep class host.exp.exponent.** { *; }
-dontwarn expo.modules.**

# ── tweetnacl / libsodium-style crypto ───────────────────────
# Pure JS in our case (tweetnacl-react-native-pure runs in Hermes),
# but if a native fallback ever ships, keep crypto provider classes.
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# ── AsyncStorage (SQLite-backed on Android) ──────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── App entry points ─────────────────────────────────────────
# MainActivity / MainApplication are referenced from manifest by
# fully-qualified name. AndroidManifest's tools:replace works at
# build time but R8 still needs explicit rules.
-keep class com.chatvault.vaultchat.MainActivity { *; }
-keep class com.chatvault.vaultchat.MainApplication { *; }

# ── Generic safety net ───────────────────────────────────────
# Many Android libs use reflection on their @Keep-annotated members.
-keep,includedescriptorclasses @androidx.annotation.Keep class * { *; }
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}
# Don't warn on missing javax.* (server-side libs pulled transitively).
-dontwarn javax.**
-dontwarn java.beans.**
