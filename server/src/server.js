import 'dotenv/config'; // reads .env into process.env
import { createApp } from './app.js';

const env = process.env;
for (const key of ['WIDGET_ID', 'IDENTITY_SECRET', 'UNREAD_ALERT_SECRET']) {
  if (!env[key]) console.warn(`[config] ${key} is not set. See .env.example.`);
}
if (env.DRY_RUN === '1') console.log('[config] DRY_RUN=1: pushes are printed, not sent.');

const app = createApp({
  octwinUrl: env.OCTWIN_URL || 'https://octwin.ai',
  widgetId: env.WIDGET_ID,
  identitySecret: env.IDENTITY_SECRET,
  unreadAlertSecret: env.UNREAD_ALERT_SECRET,
  tenantSlug: env.TENANT_SLUG,
  projectSlug: env.PROJECT_SLUG,
});

const port = Number(env.PORT || 8080);
app.listen(port, () => {
  console.log(`octwin in-app chat sample server on http://localhost:${port}`);
  console.log(`  simulator: http://localhost:${port}/simulator.html`);
});
