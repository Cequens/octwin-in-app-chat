import 'dart:io' show Platform;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'octwin_bridge.dart';
import 'session_client.dart';

/// Tells the chat screen when another screen covers it. Add it to
/// MaterialApp.navigatorObservers.
final chatRouteObserver = RouteObserver<ModalRoute<void>>();

/// The chat screen: the octwin.ai app page in a WebView.
///
/// The one rule: tell the page when the chat is on screen and when it is not.
/// octwin.ai sends an unread alert (and so a push) only for a message the user did
/// not see. If the page always says "on screen", no push is ever sent.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  static const routeName = '/chat';

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver, RouteAware {
  late final WebViewController _controller = _createController();

  bool _appInForeground = true; // false when the app goes to the background
  bool _onTop = true; // false while another screen covers this one
  String? _error;
  DateTime? _lastIdentityRefresh;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null) chatRouteObserver.subscribe(this, route);
  }

  @override
  void dispose() {
    _setActive(false); // the screen is closing: the user can no longer see the chat
    chatRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // ---- Is the chat on screen? ----

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Only "resumed" means the user can see the app.
    _appInForeground = state == AppLifecycleState.resumed;
    _reportActive();
  }

  @override
  void didPushNext() {
    _onTop = false; // another screen opened on top of the chat
    _reportActive();
  }

  @override
  void didPopNext() {
    _onTop = true; // the user came back to the chat
    _reportActive();
  }

  void _reportActive() => _setActive(_appInForeground && _onTop);

  void _setActive(bool active) {
    _controller.runJavaScript(setActiveJs(active)).catchError((Object error) {
      debugPrint('setActive($active) failed: $error');
    });
  }

  // ---- The WebView ----

  WebViewController _createController() {
    final PlatformWebViewControllerCreationParams params = WebViewPlatform.instance is WebKitWebViewPlatform
        // iOS: play voice notes inside the chat, not in a full-screen player.
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: true,
            mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
          )
        : const PlatformWebViewControllerCreationParams();

    final controller = WebViewController.fromPlatformCreationParams(
      params,
      onPermissionRequest: _onPermissionRequest,
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // Must be added before the page loads.
      ..addJavaScriptChannel(bridgeName, onMessageReceived: (message) => _onBridgeMessage(message.message));

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      // Android shows no file chooser for <input type="file"> unless the app opens one.
      platform.setOnShowFileSelector(_pickFiles);
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
    return controller;
  }

  Future<void> _load() async {
    try {
      // A fresh signed session every time the screen opens.
      final session = await sessionClient.fetchSession();
      await _controller.loadRequest(Uri.parse(session.url));
    } catch (error) {
      if (mounted) setState(() => _error = 'Could not open the chat. $error');
    }
  }

  Future<void> _onBridgeMessage(String message) async {
    switch (parseOctwinEvent(message)) {
      case OctwinEvent.ready:
        // The page may have loaded while the app was in the background. Say where we are.
        _reportActive();
      case OctwinEvent.identityRefused:
        await _refreshIdentity();
      case null:
        break;
    }
  }

  /// The signed identity expired (or the secret changed). Get a new one and give it to
  /// the page, without a reload. If it is refused again right away, stop: your server
  /// signs with the wrong secret, and retrying would loop.
  Future<void> _refreshIdentity() async {
    final last = _lastIdentityRefresh;
    if (last != null && DateTime.now().difference(last) < const Duration(seconds: 30)) {
      debugPrint('Identity refused again right after a refresh. Check IDENTITY_SECRET on your server.');
      return;
    }
    _lastIdentityRefresh = DateTime.now();
    try {
      final session = await sessionClient.fetchSession();
      await _controller.runJavaScript(setIdentityJs(session));
    } catch (error) {
      debugPrint('Could not refresh the chat identity: $error');
    }
  }

  /// The page asks for the microphone to record a voice note.
  Future<void> _onPermissionRequest(WebViewPermissionRequest request) async {
    if (!request.types.contains(WebViewPermissionResourceType.microphone)) {
      await request.deny();
      return;
    }
    // Android: the app itself must hold RECORD_AUDIO before the page can get the mic.
    // iOS: WebKit asks the user itself, with NSMicrophoneUsageDescription from Info.plist.
    if (Platform.isAndroid && !(await Permission.microphone.request()).isGranted) {
      await request.deny();
      return;
    }
    await request.grant();
  }

  /// Android only: the chat's "attach" button (photos and PDFs).
  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final List<PlatformFile> files;
    if (params.mode == FileSelectorMode.openMultiple) {
      files = await FilePicker.pickFiles();
    } else {
      final file = await FilePicker.pickFile();
      files = file == null ? [] : [file];
    }
    // The WebView reads each file from its URI. An empty list means "cancelled".
    return [for (final file in files) file.uri.toString()];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: SafeArea(
        child: _error != null
            ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
            : WebViewWidget(controller: _controller),
      ),
    );
  }
}
