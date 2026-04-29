//
// Use this file to import your target's public headers that you would like to expose to Swift.
//

// react-native-voip-push-notification — exposes
// RNVoipPushNotificationManager static class methods so AppDelegate.swift
// can forward PKPushRegistry callbacks into JS via the React Native
// bridge. Quoted import (NOT framework-style) because the pod is built
// as a static library with `use_frameworks!` disabled — that's the
// default for React Native projects.
#import "RNVoipPushNotificationManager.h"
