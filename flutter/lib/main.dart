import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'chat_screen.dart';
import 'session_client.dart';

/// Lets a push tap open the chat from outside the widget tree.
final navigatorKey = GlobalKey<NavigatorState>();
final messengerKey = GlobalKey<ScaffoldMessengerState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Reads google-services.json (Android) and GoogleService-Info.plist (iOS).
  // If you used `flutterfire configure`, pass DefaultFirebaseOptions.currentPlatform here.
  await Firebase.initializeApp();
  runApp(const OctwinSampleApp());
  await setUpPush();
}

class OctwinSampleApp extends StatelessWidget {
  const OctwinSampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'octwin.ai in-app chat',
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: messengerKey,
      navigatorObservers: [chatRouteObserver], // tells the chat when it is covered
      routes: {
        '/': (_) => const HomeScreen(),
        ChatScreen.routeName: (_) => const ChatScreen(),
      },
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My app')),
      body: Center(
        child: FilledButton.icon(
          icon: const Icon(Icons.chat_bubble_outline),
          label: const Text('Chat with us'),
          onPressed: () => Navigator.of(context).pushNamed(ChatScreen.routeName),
        ),
      ),
    );
  }
}

Future<void> setUpPush() async {
  final messaging = FirebaseMessaging.instance;

  // A tap on the notification while the app was in the background.
  FirebaseMessaging.onMessageOpenedApp.listen(openChatFromPush);
  // A tap on the notification that started the app.
  final initial = await messaging.getInitialMessage();
  if (initial != null) {
    await WidgetsBinding.instance.endOfFrame; // the navigator exists after the first frame
    openChatFromPush(initial);
  }

  // The app is open (on another screen), so the phone shows no notification.
  // Show a small bar instead.
  FirebaseMessaging.onMessage.listen((message) {
    if (message.data['type'] != 'octwin_chat') return;
    messengerKey.currentState?.showSnackBar(SnackBar(
      content: Text(message.notification?.body ?? 'You have a new message'),
      action: SnackBarAction(label: 'Open', onPressed: () => openChatFromPush(message)),
    ));
  });

  // iOS, and Android 13 or newer, show an "Allow notifications?" prompt.
  await messaging.requestPermission();

  // Tell your server where to send this user's pushes. Do it again after each login.
  messaging.onTokenRefresh.listen(_registerDevice);
  try {
    final token = await messaging.getToken();
    if (token != null) await _registerDevice(token);
  } catch (error) {
    // iOS: this fails until Apple has given the phone its push token. onTokenRefresh
    // above sends the token when it arrives.
    debugPrint('No push token yet: $error');
  }
}

Future<void> _registerDevice(String token) async {
  try {
    await sessionClient.registerDevice(token);
  } catch (error) {
    debugPrint('Could not register this phone for push: $error');
  }
}

/// Opens the chat screen. It loads a fresh signed session, and the chat shows the
/// messages the user missed. Anything above the home screen is closed first, so
/// there is only ever one chat screen.
void openChatFromPush(RemoteMessage message) {
  if (message.data['type'] != 'octwin_chat') return;
  navigatorKey.currentState?.pushNamedAndRemoveUntil(ChatScreen.routeName, (route) => route.isFirst);
}
