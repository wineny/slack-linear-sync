import { Hono } from 'hono';
import { LinearClient } from '@linear/sdk';
import type { Bindings, UserConfig } from '../types/index.js';
import { parseUserCommand, getCommandResponse } from '../handlers/user-config.js';
import { handleProjectEvent } from '../handlers/project-cache.js';

const webhook = new Hono<{ Bindings: Bindings }>();

// 계획적인 로나 봇 User ID
const BOT_USER_ID = '1fc40442-92dc-45d6-87ab-6ba17e5c0d15';

webhook.post('/', async (c) => {
  const body = await c.req.text();
  console.log('=== RAW WEBHOOK BODY ===');
  console.log(body);

  const payload = JSON.parse(body);

  console.log('=== Webhook Received ===');
  console.log('Type:', payload.type);
  console.log('Action:', payload.action);
  console.log('Full payload keys:', Object.keys(payload));

  // 이슈 생성 이벤트 로깅
  if (payload.type === 'Issue' && payload.action === 'create') {
    console.log('=== Issue Create Event ===');
    console.log('Issue ID:', payload.data?.id);
    console.log('Issue Title:', payload.data?.title);
    console.log('Cycle:', payload.data?.cycle?.number ?? 'None');
  }

  // Project 이벤트 → 캐시 업데이트
  if (payload.type === 'Project') {
    try {
      await handleProjectEvent(payload, c.env);
      return c.json({ success: true, type: 'project_cache_updated' });
    } catch (err) {
      console.error('Failed to handle project event:', err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  }

  // 봇 멘션 (AppUserNotification)
  if (payload.type === 'AppUserNotification') {
    const accessToken = await c.env.LINEAR_TOKENS.get('access_token');

    if (accessToken) {
      const linear = new LinearClient({ accessToken });

      // Linear Webhook 구조: notification 객체 안에 데이터가 있음
      const notification = payload.notification;
      const issueId = notification?.issueId || notification?.issue?.id;
      const commentBody = notification?.comment?.body || '';
      const commentId = notification?.comment?.id;
      const userId = notification?.actor?.id; // 댓글 작성자 (멘션한 사람)

      console.log('=== AppUserNotification Details ===');
      console.log('Issue ID:', issueId);
      console.log('Comment ID:', commentId);
      console.log('Comment body:', commentBody);
      console.log('User ID (actor):', userId);

      // 1. 자기 댓글에는 응답하지 않음
      if (userId === BOT_USER_ID) {
        console.log('Skipping: Bot own comment');
        return c.json({ success: true, skipped: 'self_comment' });
      }

      // 2. 봇 멘션 확인 (로나, @로나, @계획적인 로나, 또는 명령어 포함)
      const isBotMentioned = /(@로나|@계획적인\s*로나|로나\s+(매일|월수금|주간|알림|끄기))/i.test(commentBody);
      if (!isBotMentioned) {
        console.log('Skipping: Bot not mentioned in comment');
        return c.json({ success: true, skipped: 'no_mention' });
      }

      // 3. 중복 응답 방지
      if (commentId) {
        const dedupeKey = `responded:${commentId}`;
        const existing = await c.env.LINEAR_TOKENS.get(dedupeKey);
        if (existing) {
          console.log('Skipping: Already responded to this comment');
          return c.json({ success: true, skipped: 'duplicate' });
        }
        // 응답 전에 먼저 기록 (24시간 후 자동 삭제)
        await c.env.LINEAR_TOKENS.put(dedupeKey, 'true', { expirationTtl: 86400 });
      }

      if (issueId && commentBody) {
        // 사용자 명령 파싱
        const command = parseUserCommand(commentBody);

        if (command && userId) {
          // 설정 저장
          const config: UserConfig = {
            frequency: command,
            updatedAt: new Date().toISOString(),
          };
          await c.env.LINEAR_TOKENS.put(`user-config:${userId}`, JSON.stringify(config));

          // 확인 댓글
          const response = getCommandResponse(command);
          try {
            await linear.createComment({ issueId, body: response });
            console.log('Config updated for user:', userId, 'to:', command);
          } catch (err) {
            console.error('Failed to create comment:', err);
          }
        } else {
          // 일반 멘션 - 기본 응답
          try {
            await linear.createComment({
              issueId,
              body: '👋 안녕하세요! 계획적인 로나입니다.\n\n**설정 명령어:**\n- `@로나 매일 알림` - 평일 매일 리마인드\n- `@로나 월수금 알림` - 월/수/금 리마인드\n- `@로나 주간 알림` - 월요일만 리마인드 (기본)\n- `@로나 알림 끄기` - 리마인드 끄기',
            });
          } catch (err) {
            console.error('Failed to create comment:', err);
          }
        }
      }
    }
  }

  return c.json({ success: true });
});

export default webhook;
