import type { Env, SlackReactionEvent } from '../../types/index.js';
import { SlackClient } from '../../services/slack-client.js';
import { LinearClient } from '../../services/linear-client.js';
import { AIAnalyzer } from '../../services/ai-analyzer.js';
import { mapSlackUserToLinear } from '../../utils/user-mapper.js';
import { collectThreadMessages } from './thread-collector.js';

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

  const [projects, linearUsers] = await Promise.all([
    linearClient.getProjects(),
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
        description: p.description,
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
  if (analysisResult.suggestedProjectId) {
    const matchedProject = projects.find(p => p.id === analysisResult.suggestedProjectId);
    if (matchedProject?.teams.nodes[0]?.id) {
      teamId = matchedProject.teams.nodes[0].id;
    }
  }

  const issueResult = await linearClient.createIssue({
    title: analysisResult.title,
    description: analysisResult.description,
    teamId,
    stateId: env.LINEAR_DEFAULT_STATE_ID,
    assigneeId,
    priority: analysisResult.suggestedPriority || 3,
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

  const matchedProject = projects.find(p => p.id === analysisResult.suggestedProjectId);
  const projectLine = matchedProject ? `\n프로젝트: ${matchedProject.name}` : '';

  const replyText = `Linear 이슈가 생성되었습니다! 프로젝트/Cycle을 정확히 수정해주세요
<${issueResult.issueUrl}|${issueResult.issueIdentifier}> ${analysisResult.title}${projectLine}`;

  await slackClient.postMessage(channel, replyText, threadTs || messageTs);
}
