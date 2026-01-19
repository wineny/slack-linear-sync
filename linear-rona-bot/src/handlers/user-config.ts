import type { ReminderFrequency } from '../types/index.js';

/**
 * 사용자 댓글에서 설정 명령어 파싱
 */
export function parseUserCommand(comment: string): ReminderFrequency | null {
  const normalized = comment.toLowerCase().replace(/\s+/g, ' ').trim();

  // 매일 알림
  if (
    normalized.includes('매일 알림') ||
    normalized.includes('매일알림') ||
    normalized.includes('daily')
  ) {
    return 'daily';
  }

  // 월수금 알림
  if (
    normalized.includes('월수금 알림') ||
    normalized.includes('월수금알림') ||
    normalized.includes('mon-wed-fri')
  ) {
    return 'mon-wed-fri';
  }

  // 주간 알림
  if (
    normalized.includes('주간 알림') ||
    normalized.includes('주간알림') ||
    normalized.includes('weekly')
  ) {
    return 'weekly';
  }

  // 알림 끄기
  if (
    normalized.includes('알림 끄기') ||
    normalized.includes('알림끄기') ||
    normalized.includes('알림 off') ||
    normalized.includes('off')
  ) {
    return 'off';
  }

  return null;
}

/**
 * 설정 변경 확인 메시지
 */
export function getCommandResponse(frequency: ReminderFrequency): string {
  switch (frequency) {
    case 'daily':
      return '✅ 알겠어요! 이제 **평일 매일** 리마인드할게요.\n\n월~금 오전 9시 30분에 Cycle 미등록/지난 이슈를 알려드릴게요! 📅';

    case 'mon-wed-fri':
      return '✅ 알겠어요! 이제 **월/수/금**에만 리마인드할게요.\n\n월, 수, 금 오전 9시 30분에 알려드릴게요! 📆';

    case 'weekly':
      return '✅ 알겠어요! 이제 **월요일**에만 리마인드할게요.\n\n매주 월요일 오전 9시 30분에 주간 리마인드를 보내드릴게요! 🗓️';

    case 'off':
      return '✅ 알겠어요! 리마인드를 **꺼뒀어요**.\n\n다시 받고 싶으시면 언제든 `@로나 주간 알림` 이라고 말씀해주세요! 🔕';
  }
}
