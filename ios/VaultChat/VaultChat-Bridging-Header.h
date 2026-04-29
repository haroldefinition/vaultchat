//
// Use this file to import your target's public headers that you would like to expose to Swift.
//

// react-native-voip-push-notification — exposes
// RNVoipPushNotificationManager.didUpdate / didReceiveIncomingPush /
// didInvalidatePushToken so AppDelegate.swift can forward PKPushRegistry
// callbacks into JS via the React Native bridge.
#if __has_include(<RNVoipPushNotification/RNVoipPushNotificationManager.h>)
  #import <RNVoipPushNotification/RNVoipPushNotificationManager.h>
#elif __has_include("RNVoipPushNotificationManager.h")
  #import "RNVoipPushNotificationManager.h"
#endif
