/**
 * Slack Event API handler - Router
 */

import type { Env, SlackEventPayload, SlackMessageEvent, SlackReactionEvent } from '../types/index.js';
import { SlackClient } from '../services/slack-client.js';
import { handleSlackReaction } from './slack-reactions.js';
import { handleQuestion } from './pposiraegi/index.js';

export async function handleSlackEvent(
  payload: SlackEventPayload,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge, {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (payload.type !== 'event_callback' || !payload.event) {
    return new Response('OK');
  }

  const event = payload.event;

  if (event.type === 'reaction_added' || event.type === 'reaction_removed') {
    ctx.waitUntil(handleSlackReaction(event as SlackReactionEvent, env));
    return new Response('OK');
  }

  const messageEvent = event as SlackMessageEvent;

  if (messageEvent.type !== 'message' ||
      (messageEvent.subtype && messageEvent.subtype !== 'file_share')) {
    console.log(`Skipping event: type=${messageEvent.type}, subtype=${messageEvent.subtype}`);
    return new Response('OK');
  }

  if (messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts) {
    console.log('Thread reply detected - handled by Linear Slack synced thread');
    return new Response('OK');
  }

  console.log(`Processing message from target channel (or unknown channel for debugging)`);

  ctx.waitUntil((async () => {
    try {
      const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
      await handleQuestion(messageEvent, env, slackClient);
    } catch (e) {
      console.error('Background processing error:', e);
    }
  })());

  return new Response('OK');
}
