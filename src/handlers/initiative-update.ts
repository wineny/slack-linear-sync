import type { Env, LinearInitiative, LinearProjectUpdate } from '../types/index.js';
import { LinearClient } from '../services/linear-client.js';
import { mapSlackUserToLinear } from '../utils/user-mapper.js';
import { SlackClient } from '../services/slack-client.js';

export async function handleInitiativeUpdate(
  env: Env,
  slackUserId: string,
  responseUrl: string
): Promise<void> {
  try {
    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const linearClient = new LinearClient(env.LINEAR_API_TOKEN);

    const { linearUserId } = await mapSlackUserToLinear(
      slackUserId,
      slackClient,
      linearClient
    );

    if (!linearUserId) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: '❌ Linear 계정을 찾을 수 없습니다.',
        }),
      });
      return;
    }

    const initiatives = await linearClient.getMyLeadInitiatives(linearUserId);

    if (initiatives.length === 0) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: '❌ 리드하는 이니셔티브가 없습니다.',
        }),
      });
      return;
    }

    const weekStart = getWeekStart();
    const initiativeSections: string[] = [];

    for (const initiative of initiatives) {
      const projects = await linearClient.getInitiativeProjects(initiative.id);

      if (projects.length === 0) {
        continue;
      }

      const projectSections: string[] = [];

      for (const project of projects) {
        const updates = await linearClient.getProjectUpdates(project.id, weekStart);

        if (updates.length > 0) {
          const latestUpdate = updates[0];
          projectSections.push(
            `📊 *${project.name}*\n${latestUpdate.body}`
          );
        } else {
          const projectUpdateUrl = `${project.url}/updates`;
          projectSections.push(
            `📊 *${project.name}*\n업데이트 없음 - <${projectUpdateUrl}|작성하기>`
          );
        }
      }

      if (projectSections.length > 0) {
        initiativeSections.push(
          `📋 *${initiative.name}*\n\n${projectSections.join('\n\n')}\n\n---`
        );
      }
    }

    const formattedMessage = formatInitiativeMessage(initiativeSections);

    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: formattedMessage,
      }),
    });
  } catch (error) {
    console.error('Error in handleInitiativeUpdate:', error);
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      }),
    });
  }
}

function formatInitiativeMessage(sections: string[]): string {
  if (sections.length === 0) {
    return '❌ 프로젝트가 있는 이니셔티브가 없습니다.';
  }

  return sections.join('\n');
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
