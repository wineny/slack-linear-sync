/**
 * 공통 - :x: 이모지로 Linear 이슈 삭제 처리
 * 뽀시래기 + Emoji Issue 둘 다 지원
 */

import type { Env, SlackReactionEvent } from '../types/index.js';
import { SlackClient } from '../services/slack-client.js';
import { LinearClient } from '../services/linear-client.js';
import { getValidAccessToken } from '../utils/token-manager.js';


const processedReactions = new Set<string>();
const REACTION_DEDUP_EXPIRY = 60 * 1000;

function isReactionDuplicate(key: string): boolean {
  if (processedReactions.has(key)) {
    return true;
  }
  processedReactions.add(key);
  setTimeout(() => processedReactions.delete(key), REACTION_DEDUP_EXPIRY);
  return false;
}

export async function handleCancel(
  event: SlackReactionEvent,
  env: Env
): Promise<void> {
  console.log(`Cancel emoji detected on message ${event.item.channel}:${event.item.ts}`);

  const reactionKey = `reaction:${event.item.channel}:${event.item.ts}:${event.reaction}`;
  if (isReactionDuplicate(reactionKey)) {
    console.log(`Skipping duplicate reaction: ${reactionKey}`);
    return;
  }

  if (!env.ISSUE_MAPPINGS) {
    console.log('ISSUE_MAPPINGS KV not configured');
    return;
  }

  // :x:가 달린 정확한 메시지의 ts로 매핑 조회 (parentTs가 아님)
  const mappingKey = `issue:${event.item.channel}:${event.item.ts}`;
  const mappingData = await env.ISSUE_MAPPINGS.get(mappingKey);

  if (!mappingData) {
    console.log(`No issue mapping found for: ${mappingKey}`);
    return;
  }

  const { issueId, issueIdentifier, createdBy } = JSON.parse(mappingData) as {
    issueId: string;
    issueIdentifier: string;
    createdBy?: string;
  };

  // 생성자만 삭제 가능
  if (createdBy && createdBy !== event.user) {
    console.log(`Permission denied: ${event.user} is not the creator (${createdBy})`);
    return;
  }

  console.log(`Deleting issue: ${issueIdentifier} (${issueId})`);

  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );

  const linearClient = new LinearClient(tokenResult.token || env.LINEAR_API_TOKEN);
  const deleteResult = await linearClient.deleteIssue(issueId);

  if (!deleteResult.success) {
    console.error(`Failed to delete issue: ${deleteResult.error}`);
    return;
  }

  // KV 매핑 삭제
  await env.ISSUE_MAPPINGS.delete(mappingKey);

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
  const confirmText = `:wastebasket: ${issueIdentifier} 이슈가 삭제되었습니다`;
  await slackClient.postMessage(event.item.channel, confirmText, event.item.ts);

  console.log(`Issue ${issueIdentifier} deleted`);
}
