/**
 * 뽀시래기 - :해결: 이모지로 Linear 이슈 Done 처리
 */

import type { Env, SlackReactionEvent } from '../../types/index.js';
import { SlackClient } from '../../services/slack-client.js';
import { LinearClient } from '../../services/linear-client.js';
import { getValidAccessToken } from '../../utils/token-manager.js';

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

export async function handleDone(
  event: SlackReactionEvent,
  env: Env
): Promise<void> {
  console.log(`Done emoji detected on message ${event.item.channel}:${event.item.ts}`);

  const reactionKey = `reaction:${event.item.channel}:${event.item.ts}:${event.reaction}`;
  if (isReactionDuplicate(reactionKey)) {
    console.log(`Skipping duplicate reaction: ${reactionKey}`);
    return;
  }

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);

  // OAuth 토큰 사용 (이모지 누른 사람으로 표시하기 위해)
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

  const linearClient = new LinearClient(oauthToken || env.LINEAR_API_TOKEN);

  const messageInfo = await slackClient.getConversationReplies(
    event.item.channel,
    event.item.ts
  );

  if (!messageInfo.ok || !messageInfo.messages?.length) {
    console.log('Could not get message info');
    return;
  }

  const reactedMessage = messageInfo.messages[0];

  let parentTs: string;
  if (reactedMessage.thread_ts && reactedMessage.thread_ts !== reactedMessage.ts) {
    parentTs = reactedMessage.thread_ts;
    console.log(`Reaction on thread reply, parent ts: ${parentTs}`);
  } else {
    parentTs = reactedMessage.ts;
    console.log(`Reaction on parent message: ${parentTs}`);
  }

  if (!env.ISSUE_MAPPINGS) {
    console.log('ISSUE_MAPPINGS KV not configured');
    return;
  }

  const mappingKey = `issue:${event.item.channel}:${parentTs}`;
  const mappingData = await env.ISSUE_MAPPINGS.get(mappingKey);

  if (!mappingData) {
    console.log(`No issue mapping found for: ${mappingKey}`);
    return;
  }

  const { issueId, issueIdentifier } = JSON.parse(mappingData) as {
    issueId: string;
    issueIdentifier: string;
  };

  console.log(`Found issue: ${issueIdentifier} (${issueId})`);

  // 이모지 누른 사람 정보 조회
  const reactorInfo = await slackClient.getUserInfo(event.user);
  const reactorName = reactorInfo.user?.real_name || reactorInfo.user?.name || 'Unknown';
  const reactorAvatar = reactorInfo.user?.profile?.image_72 || reactorInfo.user?.profile?.image_192;

  const updateResult = await linearClient.updateIssueState(issueId, env.LINEAR_DONE_STATE_ID);

  if (!updateResult.success) {
    console.error(`Failed to update issue: ${updateResult.error}`);
    return;
  }

  // 완료 처리한 사람을 코멘트로 기록 (createAsUser로 해당 사용자 이름 표시)
  if (oauthToken) {
    await linearClient.addComment({
      issueId,
      body: `✅ Slack에서 :${env.DONE_EMOJI}: 이모지로 완료 처리`,
      createAsUser: reactorName,
      displayIconUrl: reactorAvatar,
    });
  }

  const confirmText = `:tada: ${issueIdentifier} 이슈가 완료 처리되었습니다!`;
  await slackClient.postMessage(event.item.channel, confirmText, parentTs);

  console.log(`Issue ${issueIdentifier} marked as Done by ${reactorName}`);
}
