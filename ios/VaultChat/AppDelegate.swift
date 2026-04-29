import Expo
import React
import ReactAppDependencyProvider
import PushKit

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  // Hold a strong reference to the PKPushRegistry — it must outlive
  // didFinishLaunchingWithOptions or iOS will deallocate it and the
  // PushKit pipeline goes silent. Storing it as a property keeps the
  // registry alive for the whole app lifetime.
  var voipRegistry: PKPushRegistry?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)

    // ─── PushKit registration ────────────────────────────────────
    // Wire up the VoIP push registry so iOS can wake the app from a
    // killed state and ring CallKit when an incoming call comes in
    // from another VaultChat user. The token is forwarded to JS via
    // RNVoipPushNotificationManager (react-native-voip-push-notification),
    // which in turn calls into our voipPushService.startVoipPush at
    // sign-in time — see src/services/voipPushService.js.
    //
    // Apple's contract for VoIP pushes:
    //   1. Register PKPushRegistry with type .voIP at launch.
    //   2. Implement the three PKPushRegistryDelegate methods below.
    //   3. Inside didReceiveIncomingPushWith, call CXProvider's
    //      reportNewIncomingCall WITHIN ~10 SECONDS or iOS will kill
    //      the app and revoke the entitlement. CallKit display is
    //      handled by react-native-callkeep on the JS side, which is
    //      synchronously invoked from the headless JS handler.
    let voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
    voipRegistry.desiredPushTypes = [.voIP]
    voipRegistry.delegate = self
    self.voipRegistry = voipRegistry
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  // ─── PKPushRegistryDelegate methods ─────────────────────────────
  //
  // These three methods are required by Apple. They forward the
  // PushKit lifecycle into RNVoipPushNotificationManager so the JS
  // side can:
  //   • POST the device token to /pushkit/register (didUpdate)
  //   • Trigger CallKit / display incoming-call UI (didReceiveIncomingPush)
  //   • Drop a stale token (didInvalidatePushTokenFor)

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
    // Hand off to RN module — it bridges the payload to JS where
    // voipPushService's _onIncomingPush handler is invoked. JS must
    // call CallKit (RNCallKeep.displayIncomingCall) before this
    // completion handler fires, OR iOS revokes our VoIP entitlement.
    // The 3-arg variant of didReceiveIncomingPushWith forwards a
    // completion callback so RN can call it from JS once CallKit
    // has been displayed.
    RNVoipPushNotificationManager.didReceiveIncomingPush(
      with: payload,
      forType: type.rawValue,
      andCompletion: completion
    )
  }

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didInvalidatePushTokenFor type: PKPushType
  ) {
    RNVoipPushNotificationManager.didInvalidatePushToken(forType: type.rawValue)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
