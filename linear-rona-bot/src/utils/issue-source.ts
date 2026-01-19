import type { LinearIssue, IssueSource } from '../types/index.js';

/**
 * 이슈 출처 판별
 * - direct: Linear에서 직접 생성
 * - slack-linear-sync: 우리 자동화 봇으로 생성 (질문 이슈)
 * - linear-slack-app: Linear 공식 Slack 앱으로 생성
 */
export function getIssueSource(issue: LinearIssue): IssueSource {
  // Linear Slack 앱으로 생성된 이슈
  if (issue.integrationSourceType === 'slack') {
    return 'linear-slack-app';
  }

  // slack-linear-sync (우리 자동화)
  if (
    issue.description?.includes('Slack') &&
    issue.description?.includes('채널에서 접수된 질문')
  ) {
    return 'slack-linear-sync';
  }

  // Linear에서 직접 생성
  return 'direct';
}

/**
 * 리마인드 대상인지 확인
 * - slack-linear-sync 이슈는 질문이라 Cycle 개념이 맞지 않음 → 제외
 * - direct, linear-slack-app은 리마인드 대상
 */
export function shouldRemind(issue: LinearIssue): boolean {
  const source = getIssueSource(issue);
  return source === 'direct' || source === 'linear-slack-app';
}
