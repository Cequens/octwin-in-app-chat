import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:octwin_in_app_chat/octwin_bridge.dart';
import 'package:octwin_in_app_chat/session_client.dart';

void main() {
  test('reads the two events the app page posts', () {
    expect(parseOctwinEvent('{"source":"octwin","type":"ready"}'), OctwinEvent.ready);
    expect(parseOctwinEvent('{"source":"octwin","type":"identity_refused"}'), OctwinEvent.identityRefused);
  });

  test('ignores messages that are not from octwin.ai', () {
    expect(parseOctwinEvent('{"source":"other","type":"ready"}'), isNull);
    expect(parseOctwinEvent('{"source":"octwin","type":"something_new"}'), isNull);
    expect(parseOctwinEvent('not json'), isNull);
    expect(parseOctwinEvent('[1,2]'), isNull);
  });

  test('setActive is safe to run before the page has loaded', () {
    expect(setActiveJs(false), 'window.octwin && window.octwin.setActive(false)');
    expect(setActiveJs(true), 'window.octwin && window.octwin.setActive(true)');
  });

  test('setIdentity passes the signed string through unchanged', () {
    const identity = '{"from":"user-42","phone":"+201234567890","exp":1999999999}';
    const session = ChatSession(url: 'https://octwin.ai/c/app/w#x', from: 'user-42', identity: identity, identitySig: 'abc_-');
    final js = setIdentityJs(session);

    const prefix = 'window.octwin && window.octwin.setIdentity(';
    expect(js.startsWith(prefix), isTrue);
    final argument = jsonDecode(js.substring(prefix.length, js.length - 1)) as Map<String, dynamic>;
    expect(argument, {'from': 'user-42', 'identity': identity, 'identity_sig': 'abc_-'});
  });
}
