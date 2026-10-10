/// Your server: the Node sample in ../server, or your own.
///
/// Run with: flutter run --dart-define=SERVER_URL=https://your-tunnel.example.com
/// Use an https address. A tunnel (cloudflared, ngrok) to your computer works well,
/// and octwin.ai needs one anyway to reach your unread-alert URL.
const serverUrl = String.fromEnvironment(
  'SERVER_URL',
  defaultValue: 'https://your-server.example.com',
);

/// The logged-in user.
///
/// REPLACE THIS WITH YOUR LOGIN. The sample server trusts this id so you can try it.
/// A real app sends its own session token, and the server finds the user from it.
const demoUserId = String.fromEnvironment('USER_ID', defaultValue: '42');
