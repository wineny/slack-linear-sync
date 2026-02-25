/**
 * 로찌 🥑 - :avocado: 이모지로 AI 기반 이슈 검색 & Done 처리
 * OpenClaw webhook (/hooks/agent)으로 직접 전달
 */

import type { Env, SlackReactionEvent } from '../types/index.js';
import { SlackClient } from '../services/slack-client.js';

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

export async function handleRozziDone(
  event: SlackReactionEvent,
  env: Env
): Promise<void> {
  console.log(`🥑 Avocado emoji detected on message ${event.item.channel}:${event.item.ts}`);

  const reactionKey = `reaction:${event.item.channel}:${event.item.ts}:avocado`;
  if (isReactionDuplicate(reactionKey)) {
    console.log(`Skipping duplicate reaction: ${reactionKey}`);
    return;
  }

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);

  // 메시지 내용 가져오기
  const messageInfo = await slackClient.getConversationReplies(
    event.item.channel,
    event.item.ts
  );

  if (!messageInfo.ok || !messageInfo.messages?.length) {
    console.log('Could not get message info');
    return;
  }

  const reactedMessage = messageInfo.messages[0];
  const messageText = reactedMessage.text || '';

  // OpenClaw /hooks/agent 엔드포인트로 직접 전달
  const webhookUrl = `${env.OPENCLAW_WEBHOOK_URL}/hooks/agent`;
  
  const promptMessage = `🥑 이슈 완료 요청

메시지: "${messageText}"

위 메시지와 관련된 Linear 이슈를 찾아서 완료 처리해줘.

1. Linear에서 최근 이슈 목록 조회 (진행중/할일 상태만)
2. 메시지 내용을 보고 어떤 이슈와 연관있을지 추론
3. 가장 관련있는 이슈 1개를 Done으로 변경
4. 결과 알림: "✅ EDU-XXX 완료 처리했어요!" 또는 "🥑 관련 이슈를 못 찾았어요"`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENCLAW_HOOK_TOKEN}`
      },
      body: JSON.stringify({
        message: promptMessage,
        name: "🥑 이슈 완료",
        deliver: true,
        channel: "slack",
        wakeMode: "now"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenClaw webhook failed: ${response.status} ${response.statusText} - ${errorText}`);
      await slackClient.postMessage(
        event.item.channel,
        '🥑 이슈 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.',
        reactedMessage.thread_ts || reactedMessage.ts
      );
    } else {
      console.log('Successfully sent to OpenClaw webhook');
      // OpenClaw에서 처리 완료 후 알림을 보내므로 여기서는 별도 메시지 불필요
    }
  } catch (error) {
    console.error('Error calling OpenClaw webhook:', error);
    await slackClient.postMessage(
      event.item.channel,
      '🥑 OpenClaw 연결에 실패했어요. 관리자에게 문의해주세요.',
      reactedMessage.thread_ts || reactedMessage.ts
    );
  }
}
