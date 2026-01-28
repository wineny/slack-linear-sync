import type { Env } from '../types/index.js';
import { LinearClient } from '../services/linear-client.js';
import { mapSlackUserToLinear } from '../utils/user-mapper.js';
import { SlackClient } from '../services/slack-client.js';

/**
 * Handle health update request from Slack
 * Fetches projects where user is lead and categorizes issues by status
 */
export async function handleHealthUpdate(
  payload: { userId: string; responseUrl: string },
  env: Env
): Promise<void> {
  const { userId: slackUserId, responseUrl } = payload;

  console.log(`Health update requested by ${slackUserId}`);

  try {
    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const linearClient = new LinearClient(env.LINEAR_API_TOKEN);

    // Map Slack user to Linear user
    const { linearUserId } = await mapSlackUserToLinear(
      slackUserId,
      slackClient,
      linearClient
    );

    if (!linearUserId) {
      await sendResponse(responseUrl, 'Linear 계정을 찾을 수 없습니다');
      return;
    }

    // Get projects where user is lead
    const projects = await linearClient.getMyLeadProjects(linearUserId);

    if (projects.length === 0) {
      await sendResponse(responseUrl, '리드하는 프로젝트가 없습니다');
      return;
    }

    // Calculate week start (Monday 00:00 KST)
    const weekStart = getWeekStart();

    // Fetch issues for each project and format message
    const projectSections: string[] = [];

    for (const project of projects) {
      const issues = await linearClient.getProjectIssuesForUpdate(
        project.id,
        weekStart
      );

      const sections: string[] = [];

      // Done section
      if (issues.done.length > 0) {
        sections.push(
          '*✅ 이번 주 완료 (Done)*',
          ...issues.done.map(
            (issue) => `• <${issue.url}|${issue.identifier}: ${issue.title}>`
          )
        );
      }

      // In Review section
      if (issues.inReview.length > 0) {
        sections.push(
          '*🔍 리뷰 중 (In Review)*',
          ...issues.inReview.map(
            (issue) => `• <${issue.url}|${issue.identifier}: ${issue.title}>`
          )
        );
      }

      // In Progress section
      if (issues.inProgress.length > 0) {
        sections.push(
          '*🚀 진행 중 (In Progress)*',
          ...issues.inProgress.map(
            (issue) => `• <${issue.url}|${issue.identifier}: ${issue.title}>`
          )
        );
      }

      // Next Cycle section
      if (issues.nextCycle.length > 0) {
        sections.push(
          '*📋 다음 Cycle 예정*',
          ...issues.nextCycle.map(
            (issue) =>
              `• <${issue.url}|${issue.identifier}: ${issue.title}> - Cycle ${issue.cycle.number}`
          )
        );
      }

      // Build project section
      if (sections.length > 0) {
        const projectUpdateUrl = `https://linear.app/gpters/project/${project.slugId}/updates`;
        const projectSection = [
          `📊 *${project.name}* 주간 현황`,
          '',
          ...sections,
          '',
          `👉 <${projectUpdateUrl}|Project Update 작성하기>`,
          '',
          '---',
        ].join('\n');

        projectSections.push(projectSection);
      } else {
        // All sections empty
        const projectUpdateUrl = `https://linear.app/gpters/project/${project.slugId}/updates`;
        const projectSection = [
          `📊 *${project.name}* 주간 현황`,
          '',
          '이슈 없음',
          '',
          `👉 <${projectUpdateUrl}|Project Update 작성하기>`,
          '',
          '---',
        ].join('\n');

        projectSections.push(projectSection);
      }
    }

    const formattedMessage = projectSections.join('\n');

    await sendResponse(responseUrl, formattedMessage);
  } catch (error) {
    console.error('Error in health update:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    await sendResponse(responseUrl, `오류가 발생했습니다: ${errorMessage}`);
  }
}

/**
 * Calculate week start (Monday 00:00 KST)
 */
function getWeekStart(): Date {
  const now = new Date();
  const kstOffset = 9 * 60; // KST = UTC+9
  const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);

  const dayOfWeek = kstNow.getUTCDay(); // 0=Sun, 1=Mon
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(kstNow);
  monday.setUTCDate(kstNow.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  return new Date(monday.getTime() - kstOffset * 60 * 1000); // Convert back to UTC
}

/**
 * Send response to Slack response_url
 */
async function sendResponse(responseUrl: string, text: string): Promise<void> {
  try {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send response: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending response:', error);
  }
}
