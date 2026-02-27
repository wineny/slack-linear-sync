import type { Env } from '../types/index.js';
import { LinearClient } from '../services/linear-client.js';
import { mapSlackUserToLinear } from '../utils/user-mapper.js';
import { SlackClient } from '../services/slack-client.js';

/**
 * Get AI summary of issues using Gemini API
 */
async function getAISummary(
  issues: Array<{ title: string }>,
  apiKey: string
): Promise<string> {
  if (issues.length === 0) return '없음';

  const titles = issues.map((i) => i.title).join(', ');

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `아래 작업 목록을 하나의 핵심 문장으로 요약해. 50자 이내, 번호나 나열 없이 핵심만. 예시: "인증 시스템 구축 및 테스트"\n\n${titles}`,
            }],
          }],
          generationConfig: { maxOutputTokens: 2000 },
        }),
      }
    );

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '작업 진행 중';
  } catch (error) {
    console.error('AI summary error:', error);
    return '작업 진행 중';
  }
}

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

       // 만든 결과 = Done + In Review
       const madeIssues = [...issues.done, ...issues.inReview];
       // 만들 결과 = In Progress + Next Cycle
       const toMakeIssues = [
         ...issues.inProgress,
         ...issues.nextCycle.map((issue) => ({
           id: issue.id,
           identifier: issue.identifier,
           title: issue.title,
           url: issue.url,
         })),
       ];

       // AI 요약 병렬 실행
       const [madeSummary, toMakeSummary] = await Promise.all([
         getAISummary(madeIssues, env.GEMINI_API_KEY),
         getAISummary(toMakeIssues, env.GEMINI_API_KEY),
       ]);

       const projectUpdateUrl = `${project.url}/updates`;

       const sections: string[] = [
         `📊 *${project.name}*`,
         '',
          `*만든 결과 - ${madeSummary}*`,
       ];

       if (madeIssues.length > 0) {
         sections.push(
           ...madeIssues.map(
             (issue) => `• <${issue.url}|${issue.identifier}: ${issue.title}>`
           )
         );
       }

       sections.push('');
        sections.push(`*만들 결과 - ${toMakeSummary}*`);

       if (toMakeIssues.length > 0) {
         sections.push(
           ...toMakeIssues.map(
             (issue) => `• <${issue.url}|${issue.identifier}: ${issue.title}>`
           )
         );
       }

       sections.push('');
       sections.push(`👉 <${projectUpdateUrl}|Project Update 작성하기>`);
       sections.push('');
       sections.push('---');

       projectSections.push(sections.join('\n'));
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
