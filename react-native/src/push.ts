import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { openChat } from './navigation';
import { registerDevice } from './sessionClient';

/** Our server marks chat pushes with data.type = 'octwin_chat'. */
function isChatPush(message: { data?: { [key: string]: unknown } } | null): boolean {
  return message?.data?.type === 'octwin_chat';
}

/** Call once, when navigation is ready (a tap must be able to open the chat). */
export async function setUpPush(): Promise<void> {
  const messaging = getMessaging(getApp());

  // A tap on the notification while the app was in the background.
  onNotificationOpenedApp(messaging, message => {
    if (isChatPush(message)) {
      openChat();
    }
  });

  // A tap on the notification that started the app.
  const initial = await getInitialNotification(messaging);
  if (isChatPush(initial)) {
    openChat();
  }

  // The app is open (on another screen), so the phone shows no notification. Ask instead.
  onMessage(messaging, async message => {
    if (isChatPush(message)) {
      Alert.alert('New message', String(message.notification?.body ?? 'You have a new message'), [
        { text: 'Later', style: 'cancel' },
        { text: 'Open', onPress: openChat },
      ]);
    }
  });

  await askForPermission(messaging);

  // Tell your server where to send this user's pushes. Do it again after each login.
  onTokenRefresh(messaging, registerDeviceSafely);
  try {
    await registerDeviceSafely(await getToken(messaging));
  } catch (error) {
    // No push token yet (for example, iOS without push permission). onTokenRefresh sends it later.
    console.warn('No push token yet:', error);
  }
}

async function askForPermission(messaging: ReturnType<typeof getMessaging>): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    // Android 13 and newer ask the user before showing any notification.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } else if (Platform.OS === 'ios') {
    await requestPermission(messaging);
  }
}

async function registerDeviceSafely(token: string): Promise<void> {
  try {
    await registerDevice(token);
  } catch (error) {
    console.warn('Could not register this phone for push:', error);
  }
}
