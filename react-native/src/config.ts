/**
 * Your server: the Node sample in ../server, or your own.
 * Use an https address. A tunnel (cloudflared, ngrok) to your computer works well,
 * and octwin.ai needs one anyway to reach your unread-alert URL.
 */
export const SERVER_URL = 'https://your-server.example.com';

/**
 * The logged-in user.
 * REPLACE THIS WITH YOUR LOGIN. The sample server trusts this id so you can try it.
 * A real app sends its own session token, and the server finds the user from it.
 */
export const DEMO_USER_ID = '42';
