import 'dart:convert';

import 'session_client.dart';

/// The name the app page looks for. In Flutter it is a JavaScript channel:
/// window.OctwinBridge.postMessage(...) on Android, and
/// window.webkit.messageHandlers.OctwinBridge.postMessage(...) on iOS.
const bridgeName = 'OctwinBridge';

/// What the app page tells the app.
enum OctwinEvent {
  /// The chat is loaded and window.octwin is ready.
  ready,

  /// octwin.ai refused the signed identity (it expired, or the secret changed).
  /// Get a fresh one from your server and call window.octwin.setIdentity(...).
  identityRefused,
}

/// Reads one bridge message: a JSON string like {"source":"octwin","type":"ready"}.
/// Returns null for anything else, so other scripts cannot confuse the app.
OctwinEvent? parseOctwinEvent(String message) {
  try {
    final json = jsonDecode(message);
    if (json is! Map || json['source'] != 'octwin') return null;
    return switch (json['type']) {
      'ready' => OctwinEvent.ready,
      'identity_refused' => OctwinEvent.identityRefused,
      _ => null,
    };
  } on FormatException {
    return null;
  }
}

/// JavaScript that tells the page whether the chat is on screen.
/// `window.octwin &&` makes it safe to run before the page has loaded.
String setActiveJs(bool active) => 'window.octwin && window.octwin.setActive($active)';

/// JavaScript that hands the page a freshly signed identity, without a reload.
/// jsonEncode makes a safe JavaScript literal: every quote and backslash is escaped.
String setIdentityJs(ChatSession session) {
  final identity = jsonEncode({
    'from': session.from,
    'identity': session.identity,
    'identity_sig': session.identitySig,
  });
  return 'window.octwin && window.octwin.setIdentity($identity)';
}
