import { SlackClient } from '../../services/slack-client.js';

export interface CollectedMessage {
  author: string;
  text: string;
  ts: string;          // 메시지 타임스탬프
  isTarget: boolean;   // 이모지가 달린 메시지인가?
}

const MAX_MESSAGES = 15;       // 타겟 포함 최대 메시지 수
const CONTEXT_BEFORE = 5;      // 타겟 앞 컨텍스트
const CONTEXT_AFTER = 3;       // 타겟 뒤 컨텍스트
const MAX_TEXT_LENGTH = 1500;   // 메시지당 최대 글자수

/**
 * 긴 스레드에서 타겟 메시지 중심으로 앞뒤 컨텍스트만 유지
 */
function trimMessages(messages: CollectedMessage[]): CollectedMessage[] {
  // 각 메시지 텍스트 길이 제한
  const trimmed = messages.map(m => ({
    ...m,
    text: m.text.length > MAX_TEXT_LENGTH
      ? m.text.slice(0, MAX_TEXT_LENGTH) + '... (생략)'
      : m.text,
  }));

  if (trimmed.length <= MAX_MESSAGES) return trimmed;

  const targetIdx = trimmed.findIndex(m => m.isTarget);
  if (targetIdx === -1) {
    // 타겟이 없으면 마지막 메시지들 유지
    return trimmed.slice(-MAX_MESSAGES);
  }

  const start = Math.max(0, targetIdx - CONTEXT_BEFORE);
  const end = Math.min(trimmed.length, targetIdx + CONTEXT_AFTER + 1);
  const result = trimmed.slice(start, end);

  // 앞에 생략된 메시지가 있으면 첫 메시지(스레드 시작)도 포함
  if (start > 0) {
    result.unshift({
      ...trimmed[0],
      text: trimmed[0].text + (start > 1 ? `\n\n(... ${start - 1}개 메시지 생략 ...)` : ''),
    });
  }

  console.log(`Trimmed thread: ${messages.length} → ${result.length} messages (target at index ${targetIdx})`);
  return result;
}

export async function collectThreadMessages(
  slackClient: SlackClient,
  channel: string,
  messageTs: string,
  threadTs?: string
): Promise<CollectedMessage[]> {
  const messages: CollectedMessage[] = [];
  const userNameCache = new Map<string, string>();

  async function getUserName(userId: string): Promise<string> {
    if (userNameCache.has(userId)) {
      return userNameCache.get(userId)!;
    }
    const userInfo = await slackClient.getUserInfo(userId);
    const name = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
    userNameCache.set(userId, name);
    return name;
  }

  const targetThreadTs = threadTs || messageTs;

  const threadResult = await slackClient.getThreadMessages(channel, targetThreadTs);

  if (threadResult.ok && threadResult.messages) {
    for (const msg of threadResult.messages) {
      if (msg.text && msg.user) {
        const authorName = await getUserName(msg.user);
        messages.push({
          author: authorName,
          text: msg.text,
          ts: msg.ts,
          isTarget: msg.ts === messageTs,
        });
      }
    }
  }

  if (messages.length === 0) {
    const singleResult = await slackClient.getMessage(channel, messageTs);
    if (singleResult.ok && singleResult.messages?.[0]) {
      const msg = singleResult.messages[0];
      if (msg.text && msg.user) {
        const authorName = await getUserName(msg.user);
        messages.push({
          author: authorName,
          text: msg.text,
          ts: msg.ts,
          isTarget: true,
        });
      }
    }
  }

  // 스레드가 길면 타겟 메시지 중심으로 앞뒤 컨텍스트만 유지
  return trimMessages(messages);
}

// ========== Image Collection ==========

import type { SlackFile } from '../../types/index.js';

const IMAGE_MIMETYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGES = 10;

export interface CollectedImage {
  file: SlackFile;
  isFromTarget: boolean;  // 이모지가 달린 메시지의 이미지인지
}

/**
 * 스레드 메시지에서 이미지 파일만 수집
 * 타겟 메시지(이모지가 달린 메시지)의 이미지를 우선 배치
 */
export async function collectThreadImages(
  slackClient: SlackClient,
  channel: string,
  messageTs: string,
  threadTs?: string
): Promise<CollectedImage[]> {
  const targetThreadTs = threadTs || messageTs;

  const threadResult = await slackClient.getThreadMessages(channel, targetThreadTs);

  if (!threadResult.ok || !threadResult.messages) {
    return [];
  }

  const targetImages: CollectedImage[] = [];
  const otherImages: CollectedImage[] = [];

  for (const msg of threadResult.messages) {
    if (!msg.files) continue;

    const isTarget = msg.ts === messageTs;

    for (const file of msg.files) {
      if (!IMAGE_MIMETYPES.includes(file.mimetype)) continue;

      const image: CollectedImage = { file, isFromTarget: isTarget };

      if (isTarget) {
        targetImages.push(image);
      } else {
        otherImages.push(image);
      }
    }
  }

  // 타겟 메시지 이미지 우선, 나머지는 시간순
  const allImages = [...targetImages, ...otherImages];

  if (allImages.length > MAX_IMAGES) {
    console.log(`Found ${allImages.length} images, limiting to ${MAX_IMAGES}`);
    return allImages.slice(0, MAX_IMAGES);
  }

  console.log(`Collected ${allImages.length} images (target: ${targetImages.length}, other: ${otherImages.length})`);
  return allImages;
}
