/**
 * Slack Event API handler
 */

import type { Env, SlackEventPayload, SlackMessageEvent, SlackReactionEvent } from '../types/index.js';
import { SlackClient } from '../services/slack-client.js';
import { LinearClient } from '../services/linear-client.js';
import { AIAnalyzer } from '../services/ai-analyzer.js';
import { mapSlackUserToLinear } from '../utils/user-mapper.js';
import { handleSlackReaction } from './slack-reactions.js';

// In-memory deduplication (for when KV is not available)
const processedMessages = new Set<string>();
const DEDUP_EXPIRY = 60 * 1000; // 1 minute

function isDuplicate(messageKey: string): boolean {
  if (processedMessages.has(messageKey)) {
    return true;
  }
  processedMessages.add(messageKey);
  // Auto-cleanup after expiry
  setTimeout(() => processedMessages.delete(messageKey), DEDUP_EXPIRY);
  return false;
}

export async function handleSlackEvent(
  payload: SlackEventPayload,
  env: Env
): Promise<Response> {
  // URL verification challenge
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge, {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Only process message events
  if (payload.type !== 'event_callback' || !payload.event) {
    return new Response('OK');
  }

  const event = payload.event;

  // Handle reaction events
  if (event.type === 'reaction_added' || event.type === 'reaction_removed') {
    return handleSlackReaction(event as SlackReactionEvent, env);
  }

  // Cast to message event for type safety
  const messageEvent = event as SlackMessageEvent;

  // Skip non-message events and subtypes (edits, deletes, bot messages, etc.)
  if (messageEvent.type !== 'message' || messageEvent.subtype) {
    console.log(`Skipping event: type=${messageEvent.type}, subtype=${messageEvent.subtype}`);
    return new Response('OK');
  }

  // Skip thread replies (only process top-level messages)
  if (messageEvent.thread_ts) {
    console.log('Skipping thread reply');
    return new Response('OK');
  }

  // Check if message is from target channel
  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
  console.log(`Received message in channel: ${messageEvent.channel}, user: ${messageEvent.user}`);

  const channelInfo = await slackClient.getChannelInfo(messageEvent.channel);
  console.log(`Channel info response:`, JSON.stringify(channelInfo));

  if (!channelInfo.ok) {
    console.log(`Failed to get channel info: ${channelInfo.error}`);
    // 채널 정보를 못 가져와도 일단 진행 (디버깅용)
  }

  const channelName = channelInfo.channel?.name;
  if (channelName && channelName !== env.TARGET_CHANNEL_NAME) {
    console.log(`Skipping message from channel: ${channelName} (target: ${env.TARGET_CHANNEL_NAME})`);
    return new Response('OK');
  }

  console.log(`Processing message from target channel (or unknown channel for debugging)`);

  // Check for duplicate processing
  const messageKey = `msg:${messageEvent.channel}:${messageEvent.ts}`;

  // In-memory deduplication (works without KV)
  if (isDuplicate(messageKey)) {
    console.log(`Skipping duplicate message (in-memory): ${messageKey}`);
    return new Response('OK');
  }

  // Also check KV if available
  if (env.PROCESSED_MESSAGES) {
    const existing = await env.PROCESSED_MESSAGES.get(messageKey);
    if (existing) {
      console.log(`Skipping duplicate message (KV): ${messageKey}`);
      return new Response('OK');
    }
    await env.PROCESSED_MESSAGES.put(messageKey, 'processing', { expirationTtl: 86400 });
  }

  try {
    // Process the message
    await processQuestion(messageEvent, env, slackClient);

    // Mark as completed
    if (env.PROCESSED_MESSAGES) {
      await env.PROCESSED_MESSAGES.put(messageKey, 'completed', { expirationTtl: 86400 });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    // Remove from KV on error to allow retry
    if (env.PROCESSED_MESSAGES) {
      await env.PROCESSED_MESSAGES.delete(messageKey);
    }
  }

  return new Response('OK');
}

async function processQuestion(
  event: SlackMessageEvent,
  env: Env,
  slackClient: SlackClient
): Promise<void> {
  console.log(`Processing question from user ${event.user} in channel ${event.channel}`);

  // Initialize clients
  const linearClient = new LinearClient(env.LINEAR_API_TOKEN);
  const aiAnalyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);

  // Get Slack permalink for the message
  const permalinkResult = await slackClient.getPermalink(event.channel, event.ts);
  const permalink = permalinkResult.ok ? permalinkResult.permalink : undefined;

  // Get question author's name (for description)
  const authorInfo = await slackClient.getUserInfo(event.user);
  const authorName = authorInfo.user?.real_name || authorInfo.user?.name || 'Unknown';

  // Check for mentions in the message to assign
  // Slack mentions look like <@U05AZFG3CLC>
  const mentionMatches = event.text.matchAll(/<@(U[A-Z0-9]+)>/g);
  const allMentions = [...mentionMatches].map(m => m[1]);

  let assigneeId: string | undefined;
  const subscriberIds: string[] = [];

  if (allMentions.length > 0) {
    console.log(`Found ${allMentions.length} mention(s): ${allMentions.join(', ')}`);

    // Process all mentions
    for (let i = 0; i < allMentions.length; i++) {
      const slackUserId = allMentions[i];
      const { linearUserId } = await mapSlackUserToLinear(
        slackUserId,
        slackClient,
        linearClient
      );

      if (linearUserId) {
        if (i === 0) {
          // First mention becomes assignee
          assigneeId = linearUserId;
          console.log(`Assignee: ${slackUserId} -> Linear user`);
        } else {
          // Rest become subscribers
          subscriberIds.push(linearUserId);
          console.log(`Subscriber: ${slackUserId} -> Linear user`);
        }
      }
    }
  } else {
    console.log('No mention found, leaving assignee empty');
  }

  // Analyze question with AI
  let analysis = await aiAnalyzer.analyzeQuestion(event.text, authorName, permalink);

  // Fallback if AI fails
  if (!analysis.success) {
    console.log('AI analysis failed, using fallback');
    analysis = AIAnalyzer.fallbackAnalysis(event.text, authorName, permalink);
  }

  // Create Linear issue
  const issueResult = await linearClient.createIssue({
    title: analysis.title,
    description: analysis.description,
    teamId: env.LINEAR_TEAM_ID,
    stateId: env.LINEAR_DEFAULT_STATE_ID,
    assigneeId: assigneeId,
    subscriberIds: subscriberIds.length > 0 ? subscriberIds : undefined,
    priority: 3, // Normal priority
  });

  if (!issueResult.success) {
    console.error('Failed to create Linear issue:', issueResult.error);
    throw new Error(`Linear issue creation failed: ${issueResult.error}`);
  }

  console.log(`Created Linear issue: ${issueResult.issueIdentifier}`);

  // Store mapping: Slack message ts -> Linear issue ID (for reaction-based Done)
  if (env.ISSUE_MAPPINGS && issueResult.issueId) {
    const mappingKey = `issue:${event.channel}:${event.ts}`;
    await env.ISSUE_MAPPINGS.put(mappingKey, JSON.stringify({
      issueId: issueResult.issueId,
      issueIdentifier: issueResult.issueIdentifier,
    }), { expirationTtl: 30 * 24 * 60 * 60 }); // 30 days
    console.log(`Stored issue mapping: ${mappingKey} -> ${issueResult.issueId}`);
  }

  // Post reply in Slack thread with issue link
  const replyText = `:white_check_mark: Linear 이슈가 생성되었습니다!\n<${issueResult.issueUrl}|${issueResult.issueIdentifier}>`;

  const replyResult = await slackClient.postMessage(
    event.channel,
    replyText,
    event.ts // Reply in thread
  );

  if (!replyResult.ok) {
    console.error('Failed to post Slack reply:', replyResult.error);
  }
}
