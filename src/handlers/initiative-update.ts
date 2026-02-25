import type { Env } from '../types/index.js';
import { LinearClient } from '../services/linear-client.js';
import { mapSlackUserToLinear } from '../utils/user-mapper.js';
import { SlackClient } from '../services/slack-client.js';
import { AIAnalyzer } from '../services/ai-analyzer.js';

interface ProjectResult {
  name: string;
  items: string[];
}

interface ProjectUpdate {
  projectName: string;
  body: string;
  createdAt: string;
}

function formatOutput(
  doneByProject: ProjectResult[],
  todoByProject: ProjectResult[]
): string {
  const sections: string[] = [];

  if (doneByProject.length > 0) {
    const doneSection = ['*✅ 만든 결과*', ''];
    for (const project of doneByProject) {
      doneSection.push(`*${project.name}*`);
      for (const item of project.items) {
        doneSection.push(`  •  ${item}`);
      }
      doneSection.push('');
    }
    sections.push(doneSection.join('\n'));
  }

  if (todoByProject.length > 0) {
    const todoSection = ['*📝 만들 결과*', ''];
    for (const project of todoByProject) {
      todoSection.push(`*${project.name}*`);
      for (const item of project.items) {
        todoSection.push(`  •  ${item}`);
      }
      todoSection.push('');
    }
    sections.push(todoSection.join('\n'));
  }

  return sections.join('\n');
}

async function sendSlackMessage(responseUrl: string, text: string): Promise<void> {
  const truncated = text.length > 3500 ? text.slice(0, 3500) + '\n\n_(메시지가 너무 길어 잘렸습니다)_' : text;
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text: truncated }),
  });
}

export async function handleInitiativeUpdate(
  env: Env,
  slackUserId: string,
  responseUrl: string
): Promise<void> {
  try {
    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const linearClient = new LinearClient(env.LINEAR_API_TOKEN);

    const { linearUserId } = await mapSlackUserToLinear(slackUserId, slackClient, linearClient);

    if (!linearUserId) {
      await sendSlackMessage(responseUrl, '❌ Linear 계정을 찾을 수 없습니다.');
      return;
    }

    const allInitiatives = await linearClient.getMyLeadInitiatives(linearUserId);
    
    if (allInitiatives.length === 0) {
      await sendSlackMessage(responseUrl, '❌ 리드하는 이니셔티브가 없습니다.');
      return;
    }

    const weekStart = getWeekStart();
    const MAX_INITIATIVES = 5;
    const initiatives = allInitiatives.slice(0, MAX_INITIATIVES);

    // 이번 주 업데이트 수집 (원본 body)
    const thisWeekUpdates: ProjectUpdate[] = [];

    console.log(`[DEBUG] weekStart: ${weekStart.toISOString()}`);

    for (const init of initiatives) {
      console.log(`[DEBUG] Processing initiative: ${init.name}`);
      const data = await linearClient.getInitiativeWithUpdates(init.id);
      if (!data) continue;

      console.log(`[DEBUG] Projects in initiative: ${data.projects.map(p => p.name).join(', ')}`);

      for (const project of data.projects) {
        const projectThisWeekUpdates = project.updates.filter(
          u => new Date(u.createdAt) >= weekStart
        );

        console.log(`[DEBUG] ${project.name}: ${project.updates.length} total updates, ${projectThisWeekUpdates.length} this week`);

        if (projectThisWeekUpdates.length > 0) {
          // 가장 최신 업데이트만 사용
          const latest = projectThisWeekUpdates[0];
          thisWeekUpdates.push({
            projectName: project.name,
            body: latest.body,
            createdAt: latest.createdAt,
          });
        }
      }
    }

    console.log(`[DEBUG] Total updates collected: ${thisWeekUpdates.length}`);

    if (thisWeekUpdates.length === 0) {
      await sendSlackMessage(responseUrl, '📭 이번 주에 작성된 프로젝트 업데이트가 없습니다.');
      return;
    }

    // AI가 원본 업데이트에서 완료/예정 항목 추출 + 요약
    const aiAnalyzer = new AIAnalyzer(env.GEMINI_API_KEY);
    const summarized = await aiAnalyzer.parseAndSummarizeUpdates(thisWeekUpdates);

    const output = formatOutput(summarized.done, summarized.todo);
    const moreText = allInitiatives.length > MAX_INITIATIVES 
      ? `\n_(+${allInitiatives.length - MAX_INITIATIVES}개 이니셔티브 더 있음)_` 
      : '';

    await sendSlackMessage(responseUrl, output + moreText);

  } catch (error) {
    console.error('Error in handleInitiativeUpdate:', error);
    await sendSlackMessage(
      responseUrl, 
      `❌ 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
    );
  }
}

function getWeekStart(): Date {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);

  const dayOfWeek = kstNow.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  return new Date(monday.getTime() - kstOffset * 60 * 1000);
}
