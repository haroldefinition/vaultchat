// ============================================================
//  Expo config plugin — wires PushKit (PKPushRegistry) into the
//  generated iOS AppDelegate.swift and bridging header.
//
//  Why this plugin exists:
//    react-native-voip-push-notification needs four pieces of
//    native iOS code to work:
//      1. import PushKit + PKPushRegistryDelegate conformance
//        in AppDelegate.swift
//      2. Three required PKPushRegistryDelegate methods
//        (didUpdate, didReceiveIncomingPushWith, didInvalidatePushTokenFor)
//      3. PKPushRegistry instantiation at app launch
//      4. RNVoipPushNotificationManager imported via the
//        bridging header (Swift can't import Obj-C directly).
//
//    Without a config plugin, every `npx expo prebuild --clean` would
//    overwrite our manual edits and silently break VoIP push. This
//    plugin re-applies the edits idempotently on every prebuild so
//    we never have to remember.
//
//  Configuration:
//    Already added to app.json's expo.plugins array. To re-run:
//      npx expo prebuild --clean
// ============================================================

const { withAppDelegate, withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

// Marker we drop into the AppDelegate so we know the plugin already
// applied and don't try to inject the same code twice.
const APPDELEGATE_MARKER = '// VAULTCHAT_PUSHKIT_BLOCK';

const PUSHKIT_IMPORT = 'import PushKit';

const PUSHKIT_PROPERTY = `
  // Hold a strong reference to the PKPushRegistry — it must outlive
  // didFinishLaunchingWithOptions or iOS will deallocate it and the
  // PushKit pipeline goes silent.
  var voipRegistry: PKPushRegistry?`;

const PUSHKIT_INIT = `
    ${APPDELEGATE_MARKER}
    let voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
    voipRegistry.desiredPushTypes = [.voIP]
    voipRegistry.delegate = self
    self.voipRegistry = voipRegistry`;

const PUSHKIT_DELEGATE_METHODS = `
  // PKPushRegistryDelegate — forwards lifecycle into JS via
  // RNVoipPushNotificationManager (react-native-voip-push-notification).
  public func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }
  public func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    let uuid = (payload.dictionaryPayload["uuid"] as? String) ?? UUID().uuidString
    RNVoipPushNotificationManager.addCompletionHandler(uuid, completionHandler: completion)
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
  }
  public func pushRegistry(
    _ registry: PKPushRegistry,
    didInvalidatePushTokenFor type: PKPushType
  ) {
    // No-op — package 3.3.3 doesn't expose a static invalidate handler.
    // iOS will issue a fresh token on next launch via didUpdate.
  }`;

const BRIDGING_HEADER_BLOCK = `
// react-native-voip-push-notification — exposes
// RNVoipPushNotificationManager so AppDelegate.swift can forward
// PKPushRegistry callbacks into JS. Quoted import because the pod
// is a static library (use_frameworks! is off in RN projects).
#import "RNVoipPushNotificationManager.h"
`;

function withPushKitAppDelegate(config) {
  return withAppDelegate(config, async (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(APPDELEGATE_MARKER)) return cfg; // already applied

    // 1. Add `import PushKit` after the last existing import.
    if (!src.includes(PUSHKIT_IMPORT)) {
      src = src.replace(
        /(import ReactAppDependencyProvider)/,
        `$1\n${PUSHKIT_IMPORT}`,
      );
    }

    // 2. Add PKPushRegistryDelegate conformance to AppDelegate.
    src = src.replace(
      /public class AppDelegate: ExpoAppDelegate \{/,
      'public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {',
    );

    // 3. Add the voipRegistry property right after `var window`.
    src = src.replace(
      /(var window: UIWindow\?)/,
      `$1\n${PUSHKIT_PROPERTY}`,
    );

    // 4. Inject the registry init inside didFinishLaunchingWithOptions,
    //    right before the closing `#endif` of the iOS branch.
    src = src.replace(
      /(factory\.startReactNative\([^)]*\)\s*\n\s*launchOptions: launchOptions\)\s*\n)(#endif)/,
      `$1${PUSHKIT_INIT}\n$2`,
    );

    // 5. Append the three PKPushRegistryDelegate methods just before
    //    the final closing brace of the AppDelegate class.
    src = src.replace(
      /\n\}\nclass ReactNativeDelegate/,
      `\n${PUSHKIT_DELEGATE_METHODS}\n}\nclass ReactNativeDelegate`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });
}

function withPushKitBridgingHeader(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const headerPath = path.join(
        projectRoot,
        'ios',
        cfg.modRequest.projectName || 'VaultChat',
        `${cfg.modRequest.projectName || 'VaultChat'}-Bridging-Header.h`,
      );
      try {
        let contents = fs.readFileSync(headerPath, 'utf8');
        if (!contents.includes('RNVoipPushNotificationManager')) {
          contents += BRIDGING_HEADER_BLOCK;
          fs.writeFileSync(headerPath, contents, 'utf8');
        }
      } catch (e) {
        // Bridging header not found — log but don't fail prebuild.
        console.warn('[with-pushkit] could not patch bridging header:', e.message);
      }
      return cfg;
    },
  ]);
}

module.exports = function withPushKit(config) {
  config = withPushKitAppDelegate(config);
  config = withPushKitBridgingHeader(config);
  return config;
};
