/**
 * Slack to Linear Sync - Cloudflare Worker
 *
 * Automatically creates Linear issues from questions posted in Slack channels.
 * Uses Claude Haiku for AI-powered title/description generation.
 */

import { Hono } from 'hono';
import { verifySlackSignature } from './utils/signature.js';
import { handleSlackEvent } from './handlers/slack-events.js';
import { handleHealthUpdate } from './handlers/project-update.js';
import { handleInitiativeUpdate } from './handlers/initiative-update.js';
import { getValidAccessToken } from './utils/token-manager.js';
import { LinearClient } from './services/linear-client.js';
import { reportDailyIssueItMetrics, debugDailyReport } from './services/issueit-report.js';
import type { Env, SlackEventPayload } from './types/index.js';

const app = new Hono<{ Bindings: Env }>();

// Health check endpoint
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'slack-linear-sync' });
});

// Slack Events API endpoint
app.post('/slack/events', async (c) => {
  const env = c.env;

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify Slack signature
  const signature = c.req.header('X-Slack-Signature');
  const timestamp = c.req.header('X-Slack-Request-Timestamp');

  const isValid = await verifySlackSignature(
    env.SLACK_SIGNING_SECRET,
    signature ?? null,
    timestamp ?? null,
    rawBody
  );

  if (!isValid) {
    console.error('Invalid Slack signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Parse payload
  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Handle the event
  return handleSlackEvent(payload, env, c.executionCtx);
});

// Slack Slash Command endpoint
app.post('/slack/command', async (c) => {
  const env = c.env;
  const rawBody = await c.req.text();

  // Verify Slack signature
  const signature = c.req.header('X-Slack-Signature');
  const timestamp = c.req.header('X-Slack-Request-Timestamp');

  const isValid = await verifySlackSignature(
    env.SLACK_SIGNING_SECRET,
    signature ?? null,
    timestamp ?? null,
    rawBody
  );

  if (!isValid) {
    console.error('Invalid Slack signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Parse URL-encoded body
  const params = new URLSearchParams(rawBody);
  const command = params.get('command');
  const userId = params.get('user_id');
  const responseUrl = params.get('response_url');

  if (command === '/project-update') {
    // Immediate response (3-second timeout requirement)
    c.executionCtx.waitUntil(
      handleHealthUpdate({ userId: userId!, responseUrl: responseUrl! }, env)
    );
    return c.json({
      response_type: 'ephemeral',
      text: '📊 프로젝트 현황을 가져오는 중...'
    });
  }

  if (command === '/initiative-update') {
    // Immediate response (3-second timeout requirement)
    c.executionCtx.waitUntil(
      handleInitiativeUpdate(env, userId!, responseUrl!)
    );
    return c.json({
      response_type: 'ephemeral',
      text: '📋 이니셔티브 업데이트를 가져오는 중...'
    });
  }

  return c.json({ error: 'Unknown command' }, 400);
});

// Test initiative-update directly (remove in production)
app.get('/debug/initiative-test', async (c) => {
  const env = c.env;
  const linearClient = new LinearClient(env.LINEAR_API_TOKEN);
  
  try {
    // Test with a known Linear user ID
    const testUserId = '43fe6bb7-5407-474d-b94b-d9a1bfdebe08';
    console.log('[DEBUG] Testing with user:', testUserId);
    
    const initiatives = await linearClient.getMyLeadInitiatives(testUserId);
    console.log('[DEBUG] Got initiatives:', initiatives.length);
    
    if (initiatives.length === 0) {
      return c.json({ error: 'No initiatives found' });
    }
    
    const firstInit = initiatives[0];
    console.log('[DEBUG] First initiative:', firstInit.name);
    
    const projects = await linearClient.getInitiativeProjects(firstInit.id);
    console.log('[DEBUG] Got projects:', projects.length);
    
    if (projects.length === 0) {
      return c.json({ initiatives: initiatives.length, projects: 0 });
    }
    
    const firstProject = projects[0];
    console.log('[DEBUG] First project:', firstProject.name);
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    
    const updates = await linearClient.getProjectUpdates(firstProject.id, weekStart);
    console.log('[DEBUG] Got updates:', updates.length);
    
    return c.json({
      initiatives: initiatives.length,
      firstInitiative: firstInit.name,
      projects: projects.length,
      firstProject: firstProject.name,
      updates: updates.length,
      success: true
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug: manually trigger IssueIt daily report
app.get('/debug/daily-report', async (c) => {
  const env = c.env;
  try {
    const result = await debugDailyReport(env);
    return c.json(result);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint (remove in production)
app.get('/debug/config', async (c) => {
  const env = c.env;
  const oauthToken = await env.LINEAR_TOKENS.get('access_token');
  return c.json({
    targetChannel: env.TARGET_CHANNEL_NAME,
    teamId: env.LINEAR_TEAM_ID,
    hasSlackToken: !!env.SLACK_BOT_TOKEN,
    hasLinearToken: !!env.LINEAR_API_TOKEN,
    hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
    hasKV: !!env.PROCESSED_MESSAGES,
    hasOAuthToken: !!oauthToken,
    oauthTokenLength: oauthToken?.length || 0,
    issueEmoji: env.ISSUE_EMOJI,
    aiWorkerUrl: env.AI_WORKER_URL,
  });
});

// Health check endpoint - validates OAuth token with auto-refresh
app.get('/health', async (c) => {
  const env = c.env;

  // Try to get valid token (with auto-refresh if expired)
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );

  if (!tokenResult.token) {
    return c.json({
      status: 'error',
      error: tokenResult.error || 'OAuth token missing',
      action: 'Re-authorize at https://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize'
    }, 500);
  }

  // Test the token
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': tokenResult.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { id name } }' }),
    });

    const data = await response.json() as { data?: { viewer?: { name: string } }; errors?: unknown[] };

    if (data.errors || !data.data?.viewer) {
      return c.json({
        status: 'error',
        error: 'OAuth token invalid',
        action: 'Re-authorize at https://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize'
      }, 500);
    }

    return c.json({
      status: 'ok',
      linearUser: data.data.viewer.name,
      tokenLength: tokenResult.token.length,
      tokenRefreshed: tokenResult.refreshed
    });
  } catch (error) {
    return c.json({
      status: 'error',
      error: 'Failed to connect to Linear API',
      details: String(error)
    }, 500);
  }
});

// Cron handler for daily token health check with auto-refresh
async function checkTokenHealth(env: Env): Promise<void> {
  // Try to get valid token (with auto-refresh if expired)
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );

  if (!tokenResult.token) {
    await sendSlackAlert(env, `🚨 Linear OAuth 토큰 오류: ${tokenResult.error}\n재인증 필요: https://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize`);
    return;
  }

  if (tokenResult.refreshed) {
    console.log('Token was auto-refreshed during health check');
  }

  console.log('Token health check passed');
}

async function sendSlackAlert(env: Env, message: string): Promise<void> {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: env.TARGET_CHANNEL_NAME,
        text: message,
      }),
    });
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
  }
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(checkTokenHealth(env));
  },
};
