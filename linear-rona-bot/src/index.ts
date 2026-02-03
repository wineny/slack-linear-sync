import { Hono } from 'hono';
import type { Bindings } from './types/index.js';
import oauth from './routes/oauth.js';
import webhook from './routes/webhook.js';
import { handleCycleReminder } from './cron/cycle-reminder.js';
import { rebuildProjectCache } from './handlers/project-cache.js';

const app = new Hono<{ Bindings: Bindings }>();

// 헬스 체크
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    bot: '계획적인 로나 🤖',
    features: ['cycle-reminder', 'user-config'],
  });
});

// OAuth 라우트
app.route('/oauth', oauth);

// Webhook 라우트
app.route('/webhook', webhook);

// Cron 수동 트리거 (테스트용)
app.get('/cron/trigger', async (c) => {
  console.log('Manual cron trigger');
  await handleCycleReminder(c.env);
  return c.json({ success: true, message: 'Cron executed' });
});

// 프로젝트 캐시 재구축
app.get('/cache/rebuild', async (c) => {
  try {
    console.log('Manual cache rebuild triggered');
    const projects = await rebuildProjectCache(c.env);
    return c.json({
      success: true,
      message: 'Cache rebuilt',
      projectCount: projects.length,
      projects: projects.map(p => ({ name: p.name, team: p.teamName, keywords: p.keywords })),
    });
  } catch (err) {
    console.error('Cache rebuild failed:', err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Cloudflare Workers export
export default {
  fetch: app.fetch,

  // Cron 트리거 핸들러
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log('Scheduled cron triggered at:', new Date().toISOString());
    ctx.waitUntil(handleCycleReminder(env));
  },
};
