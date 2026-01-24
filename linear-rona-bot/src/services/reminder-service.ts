import type {
  Bindings,
  LinearIssue,
  TeamInfo,
  UserConfig,
  ReminderFrequency,
  ReminderType,
} from '../types/index.js';
import { TEST_USER_ID } from '../types/index.js';
import { LinearGraphQLClient } from './linear-client.js';
import { shouldRemind } from '../utils/issue-source.js';
import { getNoCycleMessage, getOverdueMessage } from '../utils/message-templates.js';
import { getValidAccessToken } from '../utils/token-manager.js';

// Phase 1: 테스트 모드 (ny@gpters.org만 대상)
const TEST_MODE = true;
// Cloudflare Workers subrequest 제한 (50개) 대응
// 15개 댓글 × 3 subrequest (KV get + API + KV put) = 45개 < 50개
// 1분 간격 Cron 10회로 150개/10분 처리 가능
const MAX_COMMENTS_PER_RUN = 15;

/**
 * 현재 요일이 사용자 빈도에 맞는지 확인
 * 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
 */
function shouldRunToday(frequency: ReminderFrequency): boolean {
  const dayOfWeek = new Date().getUTCDay();
  // KST는 UTC+9이므로 UTC 00:30에 실행하면 KST 09:30

  switch (frequency) {
    case 'daily':
      // 평일만 (월~금)
      return dayOfWeek >= 1 && dayOfWeek <= 5;

    case 'mon-wed-fri':
      // 월(1), 수(3), 금(5)
      return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;

    case 'weekly':
      // 월요일(1)만
      return dayOfWeek === 1;

    case 'off':
      return false;
  }
}

/**
 * ISO 주 번호 (중복 방지 키용)
 */
function getWeekNumber(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * 중복 방지 키 확인
 */
async function hasRemindedThisWeek(
  kv: KVNamespace,
  issueId: string,
  type: ReminderType
): Promise<boolean> {
  const key = `reminder:${issueId}:${type}:${getWeekNumber()}`;
  const existing = await kv.get(key);
  return existing !== null;
}

/**
 * 리마인드 기록 저장
 */
async function markReminded(kv: KVNamespace, issueId: string, type: ReminderType): Promise<void> {
  const key = `reminder:${issueId}:${type}:${getWeekNumber()}`;
  await kv.put(key, new Date().toISOString(), {
    expirationTtl: 7 * 24 * 60 * 60, // 7일 후 자동 삭제
  });
}

/**
 * 사용자 설정 조회
 */
async function getUserConfig(kv: KVNamespace, userId: string): Promise<ReminderFrequency> {
  const configJson = await kv.get(`user-config:${userId}`);
  if (configJson) {
    const config = JSON.parse(configJson) as UserConfig;
    return config.frequency;
  }
  return 'weekly'; // 기본값
}

/**
 * 팀 리마인더 처리
 */
export async function processTeamReminders(
  team: TeamInfo,
  env: Bindings
): Promise<{ noCycle: number; overdue: number; skipped: number }> {
  // 토큰 유효성 검사 및 자동 갱신
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );

  if (!tokenResult.token) {
    console.error('Token error:', tokenResult.error);
    return { noCycle: 0, overdue: 0, skipped: 0 };
  }

  if (tokenResult.refreshed) {
    console.log('Token was refreshed automatically');
  }

  const accessToken = tokenResult.token;

  const linear = new LinearGraphQLClient(accessToken);
  const activeCycle = await linear.getActiveCycle(team.id);
  const issues = await linear.getActiveIssues(team);

  console.log(`[${team.name}] Active cycle: ${activeCycle?.number ?? 'None'}`);
  console.log(`[${team.name}] Total active issues: ${issues.length}`);
  if (TEST_MODE) {
    console.log(`[${team.name}] TEST_MODE: Only processing issues for user ${TEST_USER_ID}`);
  }

  const now = new Date();
  let noCycleCount = 0;
  let overdueCount = 0;
  let totalComments = 0;
  let skippedDueToLimit = 0;

  for (const issue of issues) {
    // 배치 제한 체크
    if (totalComments >= MAX_COMMENTS_PER_RUN) {
      skippedDueToLimit++;
      continue;
    }

    // 리마인드 대상인지 확인
    if (!shouldRemind(issue)) {
      continue;
    }

    // 담당자 없으면 스킵
    if (!issue.assignee) {
      continue;
    }

    // Phase 1: 테스트 모드 - 특정 사용자만 대상
    if (TEST_MODE && issue.assignee.id !== TEST_USER_ID) {
      continue;
    }

    // 사용자 빈도 설정 확인
    const userFrequency = await getUserConfig(env.LINEAR_TOKENS, issue.assignee.id);
    if (!shouldRunToday(userFrequency)) {
      continue;
    }

    // Cycle 미등록 이슈
    if (!issue.cycle) {
      if (await hasRemindedThisWeek(env.LINEAR_TOKENS, issue.id, 'no-cycle')) {
        console.log(`[${team.name}] Already reminded this week: ${issue.identifier} (no-cycle)`);
        continue;
      }

      const message = getNoCycleMessage(issue, activeCycle);
      try {
        await linear.createComment(issue.id, message);
        await markReminded(env.LINEAR_TOKENS, issue.id, 'no-cycle');
        noCycleCount++;
        totalComments++;
        console.log(`[${team.name}] Reminded no-cycle: ${issue.identifier}`);
      } catch (err) {
        console.error(`Failed to comment on ${issue.identifier}:`, err);
      }
      continue;
    }

    // Cycle 지난 이슈
    const cycleEndDate = new Date(issue.cycle.endsAt);
    if (cycleEndDate < now && issue.state.type !== 'completed') {
      if (await hasRemindedThisWeek(env.LINEAR_TOKENS, issue.id, 'overdue-cycle')) {
        console.log(`[${team.name}] Already reminded this week: ${issue.identifier} (overdue)`);
        continue;
      }

      const message = getOverdueMessage(issue);
      try {
        await linear.createComment(issue.id, message);
        await markReminded(env.LINEAR_TOKENS, issue.id, 'overdue-cycle');
        overdueCount++;
        totalComments++;
        console.log(`[${team.name}] Reminded overdue: ${issue.identifier}`);
      } catch (err) {
        console.error(`Failed to comment on ${issue.identifier}:`, err);
      }
    }
  }

  if (skippedDueToLimit > 0) {
    console.log(`[${team.name}] Skipped ${skippedDueToLimit} issues due to batch limit (${MAX_COMMENTS_PER_RUN})`);
  }

  return { noCycle: noCycleCount, overdue: overdueCount, skipped: skippedDueToLimit };
}
