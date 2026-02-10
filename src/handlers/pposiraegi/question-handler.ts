/**
 * 뽀시래기 - 질문 자동 이슈 생성 핸들러
 * TARGET_CHANNEL_NAME 채널에 메시지가 올라오면 자동으로 Linear 이슈 생성
 */

import type { Env, SlackMessageEvent } from '../../types/index.js';
import { SlackClient } from '../../services/slack-client.js';
import { LinearClient } from '../../services/linear-client.js';
import { AIAnalyzer } from '../../services/ai-analyzer.js';
import { mapSlackUserToLinear } from '../../utils/user-mapper.js';
import { getValidAccessToken } from '../../utils/token-manager.js';

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

/**
 * 질문 메시지를 처리하여 Linear 이슈 생성
 * slack-events.ts의 background task에서 호출됨
 */
export async function handleQuestion(
  event: SlackMessageEvent,
  env: Env,
  slackClient: SlackClient
): Promise<void> {
  // Check if message is from target channel
  const channelInfo = await slackClient.getChannelInfo(event.channel);

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
  const messageKey = `msg:${event.channel}:${event.ts}`;

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
    await processQuestion(event, env, slackClient);

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
    throw error;
  }
}

/**
 * 질문을 분석하고 Linear 이슈 생성
 */
async function processQuestion(
  event: SlackMessageEvent,
  env: Env,
  slackClient: SlackClient
): Promise<void> {
  console.log(`Processing question from user ${event.user} in channel ${event.channel}`);

  // Get OAuth token with automatic refresh if expired
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );

  if (tokenResult.refreshed) {
    console.log('OAuth token was refreshed automatically');
  }

  const oauthToken = tokenResult.token;
  if (!oauthToken) {
    console.error(`OAuth token not available: ${tokenResult.error}. Falling back to API key.`);
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
    projectId: env.PPOSIRAEGI_PROJECT_ID,
    projectMilestoneId: env.PPOSIRAEGI_MILESTONE_ID,
    // OAuth actor=app mode: show Slack author instead of API key owner
    createAsUser: oauthToken ? authorName : undefined,
    displayIconUrl: oauthToken ? authorAvatar : undefined,
  });

  if (!issueResult.success) {
    console.error('Failed to create Linear issue:', issueResult.error);
    // Slack에 실패 알림 전송 (디버깅용)
    await slackClient.postMessage(
      event.channel,
      `:warning: 이슈 생성 실패: ${issueResult.error}`,
      event.ts
    );
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
      createdBy: event.user,
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
