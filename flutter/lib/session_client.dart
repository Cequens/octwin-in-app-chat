import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

/// A signed chat session from your server.
class ChatSession {
  const ChatSession({
    required this.url,
    required this.from,
    required this.identity,
    required this.identitySig,
  });

  /// The app page to open: `https://octwin.ai/c/app/<widgetId>#from=...&identity=...`
  final String url;

  /// The same signed values, for window.octwin.setIdentity(...) after "identity_refused".
  final String from;
  final String identity;
  final String identitySig;
}

/// Talks to your server. Your server holds the secrets; the app never does.
class SessionClient {
  const SessionClient();

  /// POST /chat/session. Call it each time the chat screen opens: a session is short-lived.
  Future<ChatSession> fetchSession() async {
    final json = await _post('/chat/session', {'userId': demoUserId});
    return ChatSession(
      url: json['url'] as String,
      from: json['from'] as String,
      identity: json['identity'] as String,
      identitySig: json['identity_sig'] as String,
    );
  }

  /// POST /devices. Tells your server where to send this user's pushes.
  Future<void> registerDevice(String fcmToken) async {
    await _post('/devices', {'userId': demoUserId, 'token': fcmToken});
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, String> body) async {
    final response = await http.post(
      Uri.parse('$serverUrl$path'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(body),
    );
    if (response.statusCode >= 300) {
      throw Exception('$path answered ${response.statusCode}');
    }
    return response.body.isEmpty ? {} : jsonDecode(response.body) as Map<String, dynamic>;
  }
}

const sessionClient = SessionClient();
