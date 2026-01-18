/**
 * Slack Reaction handler - Mark Linear issues as Done
 */

import type { Env, SlackReactionEvent } from '../types/index.js';
import { SlackClient } from '../services/slack-client.js';
import { LinearClient } from '../services/linear-client.js';

// In-memory deduplication for reactions
const processedReactions = new Set<string>();
const REACTION_DEDUP_EXPIRY = 60 * 1000; // 1 minute

function isReactionDuplicate(key: string): boolean {
  if (processedReactions.has(key)) {
    return true;
  }
  processedReactions.add(key);
  setTimeout(() => processedReactions.delete(key), REACTION_DEDUP_EXPIRY);
  return false;
}

export async function handleSlackReaction(
  event: SlackReactionEvent,
  env: Env
): Promise<Response> {
  // Only handle reaction_added events
  if (event.type !== 'reaction_added') {
    return new Response('OK');
  }

  // Check if it's the done emoji
  const doneEmoji = env.DONE_EMOJI || 'white_check_mark';
  if (event.reaction !== doneEmoji) {
    console.log(`Skipping reaction: ${event.reaction} (expected: ${doneEmoji})`);
    return new Response('OK');
  }

  console.log(`Done emoji detected on message ${event.item.channel}:${event.item.ts}`);

  // Deduplicate
  const reactionKey = `reaction:${event.item.channel}:${event.item.ts}:${event.reaction}`;
  if (isReactionDuplicate(reactionKey)) {
    console.log(`Skipping duplicate reaction: ${reactionKey}`);
    return new Response('OK');
  }

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);

  // Get the message that was reacted to
  const messageInfo = await slackClient.getConversationReplies(
    event.item.channel,
    event.item.ts
  );

  if (!messageInfo.ok || !messageInfo.messages?.length) {
    console.log('Could not get message info');
    return new Response('OK');
  }

  const reactedMessage = messageInfo.messages[0];

  // Check if this is a thread reply (has thread_ts and it's different from ts)
  // We need to find the parent message's ts to look up the issue
  let parentTs: string;

  if (reactedMessage.thread_ts && reactedMessage.thread_ts !== reactedMessage.ts) {
    // This is a reply in a thread - use the parent's ts
    parentTs = reactedMessage.thread_ts;
    console.log(`Reaction on thread reply, parent ts: ${parentTs}`);
  } else {
    // This is the parent message itself
    parentTs = reactedMessage.ts;
    console.log(`Reaction on parent message: ${parentTs}`);
  }

  // Look up the Linear issue ID from our mapping
  if (!env.ISSUE_MAPPINGS) {
    console.log('ISSUE_MAPPINGS KV not configured');
    return new Response('OK');
  }

  const mappingKey = `issue:${event.item.channel}:${parentTs}`;
  const mappingData = await env.ISSUE_MAPPINGS.get(mappingKey);

  if (!mappingData) {
    console.log(`No issue mapping found for: ${mappingKey}`);
    return new Response('OK');
  }

  const { issueId, issueIdentifier } = JSON.parse(mappingData) as {
    issueId: string;
    issueIdentifier: string;
  };

  console.log(`Found issue: ${issueIdentifier} (${issueId})`);

  // Update Linear issue to Done state
  const linearClient = new LinearClient(env.LINEAR_API_TOKEN);
  const updateResult = await linearClient.updateIssueState(issueId, env.LINEAR_DONE_STATE_ID);

  if (!updateResult.success) {
    console.error(`Failed to update issue: ${updateResult.error}`);
    return new Response('OK');
  }

  // Post confirmation in thread
  const confirmText = `:tada: ${issueIdentifier} 이슈가 완료 처리되었습니다!`;
  await slackClient.postMessage(event.item.channel, confirmText, parentTs);

  console.log(`Issue ${issueIdentifier} marked as Done`);

  return new Response('OK');
}
