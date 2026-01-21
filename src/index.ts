/**
 * Slack to Linear Sync - Cloudflare Worker
 *
 * Automatically creates Linear issues from questions posted in Slack channels.
 * Uses Claude Haiku for AI-powered title/description generation.
 */

import { Hono } from 'hono';
import { verifySlackSignature } from './utils/signature.js';
import { handleSlackEvent } from './handlers/slack-events.js';
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
  });
});

// Health check endpoint - validates OAuth token
app.get('/health', async (c) => {
  const env = c.env;
  const oauthToken = await env.LINEAR_TOKENS.get('access_token');

  if (!oauthToken) {
    return c.json({
      status: 'error',
      error: 'OAuth token missing',
      action: 'Re-authorize at https://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize'
    }, 500);
  }

  // Test Linear API with the token
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': oauthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { id name } }' }),
    });

    const data = await response.json() as { data?: { viewer?: { name: string } }; errors?: unknown[] };

    if (data.errors || !data.data?.viewer) {
      return c.json({
        status: 'error',
        error: 'OAuth token invalid or expired',
        action: 'Re-authorize at https://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize'
      }, 500);
    }

    return c.json({
      status: 'ok',
      linearUser: data.data.viewer.name,
      tokenLength: oauthToken.length
    });
  } catch (error) {
    return c.json({
      status: 'error',
      error: 'Failed to connect to Linear API',
      details: String(error)
    }, 500);
  }
});

// Cron handler for daily token health check
async function checkTokenHealth(env: Env): Promise<void> {
  const oauthToken = await env.LINEAR_TOKENS.get('access_token');

  if (!oauthToken) {
    await sendSlackAlert(env, '🚨 Linear OAuth 토큰이 없습니다! 재인증 필요:\nhttps://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize');
    return;
  }

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': oauthToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { id } }' }),
    });

    const data = await response.json() as { errors?: unknown[] };

    if (data.errors) {
      await sendSlackAlert(env, '🚨 Linear OAuth 토큰이 만료되었습니다! 재인증 필요:\nhttps://linear-rona-bot.ny-4f1.workers.dev/oauth/authorize');
    } else {
      console.log('Token health check passed');
    }
  } catch (error) {
    console.error('Token health check failed:', error);
    await sendSlackAlert(env, `🚨 Linear API 연결 실패: ${String(error)}`);
  }
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
