import type { Env, SlackReactionEvent, CachedProject } from '../../types/index.js';
import { SlackClient } from '../../services/slack-client.js';
import { LinearClient } from '../../services/linear-client.js';
import { AIAnalyzer } from '../../services/ai-analyzer.js';
import { mapSlackUserToLinear } from '../../utils/user-mapper.js';
import { collectThreadMessages } from './thread-collector.js';
import { getProjectsFromCache } from '../../services/project-cache.js';

export async function handleEmojiIssue(
  event: SlackReactionEvent,
  env: Env
): Promise<void> {
  const { channel, ts: messageTs } = event.item;
  const reactorUserId = event.user;

  console.log(`Emoji issue triggered by ${reactorUserId} on ${channel}:${messageTs}`);

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
  const linearClient = new LinearClient(env.LINEAR_API_TOKEN);
  const aiAnalyzer = new AIAnalyzer(env.ANTHROPIC_API_KEY);

  const messageResult = await slackClient.getConversationReplies(channel, messageTs);
  if (!messageResult.ok || !messageResult.messages?.[0]) {
    console.log('Could not get message info');
    return;
  }

  const reactedMessage = messageResult.messages[0];
  const threadTs = reactedMessage.thread_ts;

  const messages = await collectThreadMessages(slackClient, channel, messageTs, threadTs);

  if (messages.length === 0) {
    console.log('No messages to analyze');
    return;
  }

  console.log(`Collected ${messages.length} messages for analysis`);

  // 캐시에서 프로젝트 조회 (linear-rona-bot이 Webhook으로 관리)
  const [projects, linearUsers] = await Promise.all([
    getProjectsFromCache(env),
    linearClient.getUsers(),
  ]);

  const permalinkResult = await slackClient.getPermalink(channel, threadTs || messageTs);
  const permalink = permalinkResult.ok ? permalinkResult.permalink : undefined;

  console.log('Analyzing with AI:', JSON.stringify({
    messagesCount: messages.length,
    projectsCount: projects.length,
    usersCount: linearUsers.length,
    permalink,
    firstMessage: messages[0],
  }));

  const analysisResult = await aiAnalyzer.analyzeSlackThread(
    messages,
    {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        keywords: p.keywords,
        teamName: p.teamName,
        recentIssueTitles: p.recentIssueTitles,
      })),
      users: linearUsers.map(u => ({
        id: u.id,
        name: u.name,
      })),
    },
    permalink
  );

  console.log('AI analysis result:', JSON.stringify(analysisResult));

  if (!analysisResult.success) {
    console.error('AI analysis failed:', analysisResult.error);
    await slackClient.postMessage(
      channel,
      `:warning: 이슈 생성 실패: ${analysisResult.error || 'AI 분석에 실패했습니다.'}`,
      threadTs || messageTs
    );
    return;
  }

  const { linearUserId } = await mapSlackUserToLinear(
    reactorUserId,
    slackClient,
    linearClient
  );
  const assigneeId = linearUserId || undefined;

  let teamId = env.LINEAR_TEAM_ID;
  let matchedProject: CachedProject | undefined;

  console.log(`AI suggested projectId: ${analysisResult.suggestedProjectId || 'null'}`);

  if (analysisResult.suggestedProjectId) {
    matchedProject = projects.find(p => p.id === analysisResult.suggestedProjectId);

    if (matchedProject?.teamId) {
      teamId = matchedProject.teamId;
      console.log(`✓ Matched project: "${matchedProject.name}" (${matchedProject.teamName})`);
    } else if (matchedProject) {
      console.warn(`Project "${matchedProject.name}" has no team, using default`);
    } else {
      console.warn(`Project ID "${analysisResult.suggestedProjectId}" not found in ${projects.length} projects`);
    }
  } else {
    console.log('No projectId from AI, using default Education team');
  }

  const issueResult = await linearClient.createIssue({
    title: analysisResult.title,
    description: analysisResult.description,
    teamId,
    stateId: env.LINEAR_DEFAULT_STATE_ID,
    assigneeId,
    priority: analysisResult.suggestedPriority || 3,
    projectId: analysisResult.suggestedProjectId,
    estimate: analysisResult.suggestedEstimate,
  });

  if (!issueResult.success) {
    console.error('Failed to create Linear issue:', issueResult.error);
    await slackClient.postMessage(
      channel,
      `:warning: 이슈 생성 실패: ${issueResult.error}`,
      threadTs || messageTs
    );
    return;
  }

  console.log(`Created Linear issue: ${issueResult.issueIdentifier}`);

  if (issueResult.issueId && permalink) {
    await linearClient.linkSlackThread(issueResult.issueId, permalink, true);
  }

  const reactorInfo = await slackClient.getUserInfo(reactorUserId);
  const reactorName = reactorInfo.user?.real_name || reactorInfo.user?.name || 'Unknown';

  // matchedProject는 위에서 이미 할당됨
  const projectLine = matchedProject ? `\n프로젝트: ${matchedProject.name}` : '';
  const estimateLine = analysisResult.suggestedEstimate ? ` · ${analysisResult.suggestedEstimate}pt` : '';

  const replyText = `Linear 이슈가 생성되었습니다! 프로젝트/Cycle을 정확히 수정해주세요
<${issueResult.issueUrl}|${issueResult.issueIdentifier}> ${analysisResult.title}${estimateLine}${projectLine}`;

  await slackClient.postMessage(channel, replyText, threadTs || messageTs);
}
