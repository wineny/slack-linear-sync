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
  return handleSlackEvent(payload, env);
});

// Debug endpoint (remove in production)
app.get('/debug/config', (c) => {
  const env = c.env;
  return c.json({
    targetChannel: env.TARGET_CHANNEL_NAME,
    teamId: env.LINEAR_TEAM_ID,
    hasSlackToken: !!env.SLACK_BOT_TOKEN,
    hasLinearToken: !!env.LINEAR_API_TOKEN,
    hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
    hasKV: !!env.PROCESSED_MESSAGES,
  });
});

export default app;
