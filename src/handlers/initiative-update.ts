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

const MAX_INITIATIVES = 5;
const MAX_BODY_LENGTH = 1500;
const MAX_TOTAL_UPDATES = 30;

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
  const message = text.trim() || '⚠️ 업데이트 요약을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.';
  const truncated = message.length > 3500 ? message.slice(0, 3500) + '\n\n_(메시지가 너무 길어 잘렸습니다)_' : message;
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
    const totalStart = Date.now();
    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const linearClient = new LinearClient(env.LINEAR_API_TOKEN);

    const { linearUserId } = await mapSlackUserToLinear(slackUserId, slackClient, linearClient);
    console.log(`[initiative-update] userMap: ${Date.now() - totalStart}ms`);

    if (!linearUserId) {
      await sendSlackMessage(responseUrl, '❌ Linear 계정을 찾을 수 없습니다.');
      return;
    }

    const allInitiatives = await linearClient.getMyLeadInitiatives(linearUserId);
    console.log(`[initiative-update] initiatives: ${Date.now() - totalStart}ms (${allInitiatives.length} found)`);

    if (allInitiatives.length === 0) {
      await sendSlackMessage(responseUrl, '❌ 리드하는 이니셔티브가 없습니다.');
      return;
    }

    const weekStart = getWeekStart();
    const initiatives = allInitiatives.slice(0, MAX_INITIATIVES);

    // 이니셔티브별 업데이트를 병렬로 수집
    const initiativeResults = await Promise.all(
      initiatives.map(init => linearClient.getInitiativeWithUpdates(init.id))
    );

    const thisWeekUpdates: ProjectUpdate[] = [];

    for (const data of initiativeResults) {
      if (!data) continue;

      for (const project of data.projects) {
        const projectThisWeekUpdates = project.updates.filter(
          u => new Date(u.createdAt) >= weekStart
        );

        if (projectThisWeekUpdates.length > 0) {
          const latest = projectThisWeekUpdates[0];
          // body 길이 제한 (Gemini 컨텍스트 초과 방지)
          const body = latest.body.length > MAX_BODY_LENGTH
            ? latest.body.slice(0, MAX_BODY_LENGTH) + '...(생략)'
            : latest.body;
          thisWeekUpdates.push({
            projectName: project.name,
            body,
            createdAt: latest.createdAt,
          });
        }
      }
    }

    console.log(`[initiative-update] updates: ${Date.now() - totalStart}ms (${thisWeekUpdates.length} from ${initiatives.length} initiatives)`);

    if (thisWeekUpdates.length === 0) {
      await sendSlackMessage(responseUrl, '📭 이번 주에 작성된 프로젝트 업데이트가 없습니다.');
      return;
    }

    // 업데이트가 너무 많으면 잘라냄
    const updatesToProcess = thisWeekUpdates.slice(0, MAX_TOTAL_UPDATES);
    if (thisWeekUpdates.length > MAX_TOTAL_UPDATES) {
      console.log(`[initiative-update] Truncated from ${thisWeekUpdates.length} to ${MAX_TOTAL_UPDATES} updates`);
    }

    const aiStart = Date.now();
    const aiAnalyzer = new AIAnalyzer(env.GEMINI_API_KEY);
    const summarized = await aiAnalyzer.parseAndSummarizeUpdates(updatesToProcess);
    console.log(`[initiative-update] ai: ${Date.now() - aiStart}ms, total: ${Date.now() - totalStart}ms`);

    // AI 실패 시 프로젝트 이름 목록으로 fallback
    if (summarized.aiError && summarized.done.length === 0 && summarized.todo.length === 0) {
      console.warn(`[initiative-update] AI failed: ${summarized.aiError}`);
      const projectNames = updatesToProcess.map(u => u.projectName);
      const uniqueNames = [...new Set(projectNames)];
      const fallbackText = [
        '⚠️ AI 요약에 실패했습니다. 이번 주 업데이트가 있는 프로젝트:',
        '',
        ...uniqueNames.map(n => `  •  ${n}`),
        '',
        '`/initiative-update`를 다시 시도하거나 Linear에서 직접 확인해주세요.',
      ].join('\n');
      await sendSlackMessage(responseUrl, fallbackText);
      return;
    }

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
