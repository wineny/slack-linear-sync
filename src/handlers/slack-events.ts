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
  env: Env,
  ctx: ExecutionContext
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
    ctx.waitUntil(handleSlackReaction(event as SlackReactionEvent, env));
    return new Response('OK');
  }

  // Cast to message event for type safety
  const messageEvent = event as SlackMessageEvent;

  // Skip non-message events and subtypes (edits, deletes, bot messages, etc.)
  // But allow file_share (image/file attachments with text)
  if (messageEvent.type !== 'message' ||
      (messageEvent.subtype && messageEvent.subtype !== 'file_share')) {
    console.log(`Skipping event: type=${messageEvent.type}, subtype=${messageEvent.subtype}`);
    return new Response('OK');
  }

  // Handle thread replies - now handled by Linear's official Slack app via synced thread
  // The linkSlackThread() API with syncToCommentThread: true enables bi-directional sync
  // so we no longer need our custom comment syncing
  if (messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts) {
    console.log('Thread reply detected - handled by Linear Slack synced thread');
    return new Response('OK');
  }

  // Check if message is from target channel
  console.log(`Processing message from target channel (or unknown channel for debugging)`);

  // Process in background
  ctx.waitUntil((async () => {
    try {
      // Check if message is from target channel (now inside background task)
      const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
      const channelInfo = await slackClient.getChannelInfo(messageEvent.channel);

      if (channelInfo.ok && channelInfo.channel?.name) {
        const channelName = channelInfo.channel.name;
        if (channelName !== env.TARGET_CHANNEL_NAME) {
          console.log(`Skipping message from channel: ${channelName} (target: ${env.TARGET_CHANNEL_NAME})`);
          return;
        }
      } else {
        console.log(`Failed to get channel info or name, proceeding anyway for safety: ${JSON.stringify(channelInfo)}`);
      }

      // Check for duplicate processing
      // Check for duplicate processing
      const messageKey = `msg:${messageEvent.channel}:${messageEvent.ts}`;

      // In-memory deduplication (works without KV)
      if (isDuplicate(messageKey)) {
        console.log(`Skipping duplicate message (in-memory): ${messageKey}`);
        return;
      }

      // Also check KV if available
      if (env.PROCESSED_MESSAGES) {
        const existing = await env.PROCESSED_MESSAGES.get(messageKey);
        if (existing) {
          console.log(`Skipping duplicate message (KV): ${messageKey}`);
          return;
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
    } catch (e) {
      console.error('Background processing error:', e);
    }
  })());

  return new Response('OK');
}

async function processQuestion(
  event: SlackMessageEvent,
  env: Env,
  slackClient: SlackClient
): Promise<void> {
  console.log(`Processing question from user ${event.user} in channel ${event.channel}`);

  // Get OAuth token from KV (shared with linear-rona-bot)
  // This enables createAsUser to show "Author (via 계획적인 로나)" instead of API key owner
  const oauthToken = await env.LINEAR_TOKENS.get('access_token');
  if (!oauthToken) {
    console.error('OAuth token not found in LINEAR_TOKENS KV. Falling back to API key.');
  }

  // Initialize clients - prefer OAuth token for createAsUser support
  const linearClient = new LinearClient(oauthToken || env.LINEAR_API_TOKEN);
  const aiAnalyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);

  // Get Slack permalink for the message
  const permalinkResult = await slackClient.getPermalink(event.channel, event.ts);
  const permalink = permalinkResult.ok ? permalinkResult.permalink : undefined;

  // Get question author's info (for description and createAsUser)
  const authorInfo = await slackClient.getUserInfo(event.user);
  const authorName = authorInfo.user?.real_name || authorInfo.user?.name || 'Unknown';
  const authorAvatar = authorInfo.user?.profile?.image_72 || authorInfo.user?.profile?.image_192;

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
  // If OAuth token is available, use createAsUser to show "Author (via 계획적인 로나)"
  const issueResult = await linearClient.createIssue({
    title: analysis.title,
    description: analysis.description,
    teamId: env.LINEAR_TEAM_ID,
    stateId: env.LINEAR_DEFAULT_STATE_ID,
    assigneeId: assigneeId,
    subscriberIds: subscriberIds.length > 0 ? subscriberIds : undefined,
    priority: 3, // Normal priority
    // OAuth actor=app mode: show Slack author instead of API key owner
    createAsUser: oauthToken ? authorName : undefined,
    displayIconUrl: oauthToken ? authorAvatar : undefined,
  });

  if (!issueResult.success) {
    console.error('Failed to create Linear issue:', issueResult.error);
    throw new Error(`Linear issue creation failed: ${issueResult.error}`);
  }

  console.log(`Created Linear issue: ${issueResult.issueIdentifier}`);

  // Link Slack thread to Linear issue for bi-directional comment sync
  // Linear's official Slack app will handle comment sync via synced thread
  if (issueResult.issueId && permalink) {
    const linkResult = await linearClient.linkSlackThread(
      issueResult.issueId,
      permalink,
      true  // syncToCommentThread: enables bi-directional sync
    );
    if (linkResult.success) {
      console.log(`Linked Slack thread to issue ${issueResult.issueIdentifier}`);
    } else {
      console.error(`Failed to link Slack thread: ${linkResult.error}`);
    }
  }

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

// NOTE: handleThreadReply() function removed
// Thread reply syncing is now handled by Linear's official Slack app via synced thread
// The linkSlackThread() API with syncToCommentThread: true enables bi-directional sync
