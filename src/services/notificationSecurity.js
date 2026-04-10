// Counter to Signal iOS notification storage flaw:
// iOS stores notification content in a database accessible via
// notification_service extraction. We counter this by:
// 1. Never putting message content in push notification payload
// 2. Using empty/generic notification text
// 3. Fetching real content only when app is open and authenticated
// 4. Clearing notification content from iOS notification center after read

export const SAFE_NOTIFICATION_PAYLOAD = {
  title: 'VaultChat',
  body: 'New message received',  // Never includes actual content
  data: { type: 'new_message' }, // No message content in payload
};

export const NOTIFICATION_SECURITY_CONFIG = {
  // Strip content from all notifications
  contentAvailable: true,
  mutableContent: false, // Prevent notification service extension from accessing content
  sound: 'default',
  // Never store message content in notification
  body: 'New message', // Generic - actual content fetched only after biometric auth
};

export function sanitizeNotification(notification) {
  // Remove any message content before displaying
  return {
    ...notification,
    body: 'New message received',
    title: 'VaultChat',
    // Strip all custom data that could contain message content
    data: { type: notification?.data?.type || 'message', roomId: notification?.data?.roomId },
  };
}

export const SECURITY_NOTES = {
  iosNotificationFlaw: `
    VaultChat Security: Unlike Signal, we never store message 
    content in iOS notification storage. All notifications 
    contain only "New message received" — actual content is 
    fetched only after successful biometric authentication 
    within the app, leaving no extractable data in iOS logs.
  `,
};
