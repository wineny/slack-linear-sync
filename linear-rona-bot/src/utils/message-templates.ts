import type { CycleInfo, LinearIssue } from '../types/index.js';

/**
 * 날짜 포맷 (M월 D일)
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 랜덤 메시지 선택
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Cycle 미등록 이슈 메시지
 */
export function getNoCycleMessage(issue: LinearIssue, activeCycle: CycleInfo | null): string {
  const messages = [
    // 부드러운 권유
    `👋 안녕하세요! 계획적인 로나예요.

이 이슈가 아직 Cycle에 등록되지 않았어요!
${activeCycle ? `현재 **Cycle ${activeCycle.number}** (${formatDate(activeCycle.endsAt)}까지)이 진행 중이에요.` : ''}

Cycle에 등록하면 팀 진행률도 파악되고, 언제 할지 명확해져서 좋아요! 🗓️`,

    // 살짝 걱정하는 톤
    `🤔 로나가 발견했어요!

이 이슈, Cycle 없이 떠돌고 있네요...
계획이 없으면 나중에 까먹을 수도 있어요!

${activeCycle ? `현재 **Cycle ${activeCycle.number}**에 넣어주시거나, ` : ''}Backlog로 정리해주세요~ 📋`,

    // 귀여운 재촉
    `✨ 계획적인 로나의 체크인!

저기... 이 이슈 Cycle이 없는데, 혹시 의도한 건가요?
${activeCycle ? `지금 할 일이라면 **Cycle ${activeCycle.number}**에 넣어주시면 감사해요!` : ''}

(괜히 참견하는 거 아니에요, 정말 걱정이에요! 💕)`,
  ];

  return pickRandom(messages);
}

/**
 * Cycle 지난 이슈 메시지
 */
export function getOverdueMessage(issue: LinearIssue): string {
  const cycleNumber = issue.cycle?.number ?? '?';
  const cycleEndDate = issue.cycle?.endsAt ? formatDate(issue.cycle.endsAt) : '?';

  const messages = [
    // 걱정하는 톤
    `😰 로나가 걱정돼요...

이 이슈가 **Cycle ${cycleNumber}**에 있었는데,
그 Cycle이 ${cycleEndDate}에 끝났어요!

아직 완료되지 않았다면:
- ✅ 완료했으면 **Done**으로 바꿔주세요
- 📅 더 필요하면 **현재 Cycle**로 옮겨주세요
- 🗃️ 나중에 할 거면 **Backlog**로 보내주세요

어떻게 하실 건가요? 🤔`,

    // 독촉 (하지만 귀엽게)
    `⏰ 띵동! 계획적인 로나 알림이에요!

이 이슈, **Cycle ${cycleNumber}** 때 하기로 했었죠?
근데 Cycle이 ${cycleEndDate}에 끝났는데 아직 Done이 아니에요...

혹시 잊으신 건 아니죠?
상태 업데이트 부탁드려요~ 🙏`,

    // 살짝 투정
    `🥺 로나... 좀 속상해요

**Cycle ${cycleNumber}**이 ${cycleEndDate}에 끝났는데 이 이슈가 아직 남아있어요.
계획대로 안 되면 저도 불안해진다구요...

제발 상태 좀 정리해주세요!
(근데 어려우시면 말씀하세요, 도와드릴게요! 💪)`,
  ];

  return pickRandom(messages);
}
