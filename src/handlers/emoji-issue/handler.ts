import type { Env, SlackReactionEvent, CachedProject, ImageData, ImageAnalysisResult } from '../../types/index.js';
import { SlackClient } from '../../services/slack-client.js';
import { LinearClient } from '../../services/linear-client.js';
import { AIAnalyzer } from '../../services/ai-analyzer.js';
import type { ThreadAnalysisResult } from '../../services/ai-analyzer.js';
import { ImageProcessor } from '../../services/image-processor.js';
import { mapSlackUserToLinear } from '../../utils/user-mapper.js';
import { collectThreadMessages, collectThreadImages } from './thread-collector.js';
import { getProjectsFromCache } from '../../services/project-cache.js';
import { getValidAccessToken } from '../../utils/token-manager.js';

export async function handleEmojiIssue(
  event: SlackReactionEvent,
  env: Env
): Promise<void> {
  const { channel, ts: messageTs } = event.item;
  const reactorUserId = event.user;

  console.log(`Emoji issue triggered by ${reactorUserId} on ${channel}:${messageTs}`);

  const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
  
  const tokenResult = await getValidAccessToken(
    env.LINEAR_TOKENS,
    env.LINEAR_CLIENT_ID,
    env.LINEAR_CLIENT_SECRET
  );
  
  if (tokenResult.refreshed) {
    console.log('OAuth token was refreshed automatically');
  }
  
  const oauthToken = tokenResult.token;
  if (!oauthToken) {
    console.error(`OAuth token not available: ${tokenResult.error}. Falling back to API key.`);
  }
  
  const linearClient = new LinearClient(oauthToken || env.LINEAR_API_TOKEN);
  const aiAnalyzer = new AIAnalyzer(env.GEMINI_API_KEY);

  const messageResult = await slackClient.getConversationReplies(channel, messageTs);
  if (!messageResult.ok || !messageResult.messages?.[0]) {
    console.log('Could not get message info');
    return;
  }

  const reactedMessage = messageResult.messages[0];
  const threadTs = reactedMessage.thread_ts;

  // 텍스트 메시지와 이미지를 동시에 수집
  const [messages, collectedImages] = await Promise.all([
    collectThreadMessages(slackClient, channel, messageTs, threadTs),
    collectThreadImages(slackClient, channel, messageTs, threadTs),
  ]);

  // 텍스트도 이미지도 없으면 종료
  if (messages.length === 0 && collectedImages.length === 0) {
    console.log('No messages or images to analyze');
    return;
  }

  console.log(`Collected ${messages.length} messages, ${collectedImages.length} images`);

  // 캐시에서 프로젝트 조회 + 이미지 다운로드를 병렬 실행
  const imageProcessor = collectedImages.length > 0
    ? new ImageProcessor(slackClient, env.AI_WORKER_URL, env.AI_WORKER, env.GEMINI_API_KEY)
    : null;

  const [projects, linearUsers, imageDataList] = await Promise.all([
    getProjectsFromCache(env),
    linearClient.getUsers(),
    imageProcessor
      ? imageProcessor.downloadAll(collectedImages.map(ci => ci.file))
      : Promise.resolve([] as ImageData[]),
  ]);

  const permalinkResult = await slackClient.getPermalink(channel, threadTs || messageTs);
  const permalink = permalinkResult.ok ? permalinkResult.permalink : undefined;

  // 프로젝트/사용자 컨텍스트 (텍스트 분석 + 이미지 분석 공유)
  const projectContext = {
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      content: p.content,
      keywords: p.keywords,
      teamName: p.teamName,
      recentIssueTitles: p.recentIssueTitles,
    })),
    users: linearUsers.map(u => ({
      id: u.id,
      name: u.name,
    })),
  };

  // ========== 이미지 분석 + R2 업로드 (이미지가 있고 다운로드 성공한 경우) ==========
  let imageAnalysisResult: ImageAnalysisResult | null = null;
  let r2Urls: string[] = [];

  if (imageProcessor && imageDataList.length > 0) {
    console.log(`Processing ${imageDataList.length} downloaded images...`);

    const [analysisRes, uploadedUrls] = await Promise.all([
      imageProcessor.analyzeImages(imageDataList, {
        projects: projectContext.projects.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          recentIssueTitles: p.recentIssueTitles,
        })),
        users: projectContext.users,
      }),
      imageProcessor.uploadImages(imageDataList),
    ]);

    imageAnalysisResult = analysisRes;
    r2Urls = uploadedUrls;

    console.log('Image analysis:', JSON.stringify({
      success: analysisRes.success,
      title: analysisRes.title?.slice(0, 50),
      r2Urls: r2Urls.length,
    }));
  }

  // ========== 텍스트 AI 분석 (텍스트 메시지가 있을 때만) ==========
  let textAnalysisResult: ThreadAnalysisResult;

  if (messages.length > 0) {
    console.log('Analyzing text with AI:', JSON.stringify({
      messagesCount: messages.length,
      projectsCount: projects.length,
      usersCount: linearUsers.length,
      permalink,
      firstMessage: messages[0],
    }));

    textAnalysisResult = await aiAnalyzer.analyzeSlackThread(
      messages,
      projectContext,
      permalink
    );
  } else {
    // 텍스트 없음 — 이미지만으로 진행
    console.log('No text messages, relying on image analysis only');
    textAnalysisResult = { title: '', description: '', success: false, error: 'No text messages' };
  }

  console.log('Text analysis result:', JSON.stringify(textAnalysisResult));

  // ========== 텍스트 + 이미지 분석 결과 병합 ==========
  const finalResult = mergeAnalysisResults(textAnalysisResult, imageAnalysisResult, r2Urls);

  if (!finalResult.success) {
    console.error('Analysis failed:', finalResult.error);
    await slackClient.postMessage(
      channel,
      `:warning: 이슈 생성 실패: ${finalResult.error || 'AI 분석에 실패했습니다.'}`,
      threadTs || messageTs
    );
    return;
  }

  const [{ linearUserId }, reactorInfo] = await Promise.all([
    mapSlackUserToLinear(reactorUserId, slackClient, linearClient),
    slackClient.getUserInfo(reactorUserId),
  ]);
  const assigneeId = linearUserId || undefined;
  const reactorName = reactorInfo.user?.real_name || reactorInfo.user?.name || 'Unknown';
  const reactorAvatar = reactorInfo.user?.profile?.image_72 || reactorInfo.user?.profile?.image_192;

  let teamId = env.LINEAR_TEAM_ID;
  let matchedProject: CachedProject | undefined;

  console.log(`AI suggested projectId: ${finalResult.suggestedProjectId || 'null'}`);

  if (finalResult.suggestedProjectId) {
    matchedProject = projects.find(p => p.id === finalResult.suggestedProjectId);

    if (matchedProject?.teamId) {
      teamId = matchedProject.teamId;
      console.log(`✓ Matched project: "${matchedProject.name}" (${matchedProject.teamName})`);
    } else if (matchedProject) {
      console.warn(`Project "${matchedProject.name}" has no team, using default`);
    } else {
      console.warn(`Project ID "${finalResult.suggestedProjectId}" not found in ${projects.length} projects, clearing invalid ID`);
      finalResult.suggestedProjectId = undefined;
    }
  } else {
    console.log('No projectId from AI, using default Education team');
  }

  // stateId는 팀별로 다르므로, 팀이 변경되면 해당 팀의 stateId를 사용
  const stateId = teamId === env.LINEAR_TEAM_ID
    ? env.LINEAR_DEFAULT_STATE_ID   // Education 팀: 기본 Todo
    : undefined;                     // 다른 팀: Linear 기본 상태 사용

  const issueResult = await linearClient.createIssue({
    title: finalResult.title,
    description: finalResult.description,
    teamId,
    stateId,
    assigneeId,
    priority: finalResult.suggestedPriority || 3,
    projectId: finalResult.suggestedProjectId,
    estimate: finalResult.suggestedEstimate,
    createAsUser: oauthToken ? reactorName : undefined,
    displayIconUrl: oauthToken ? reactorAvatar : undefined,
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

  // Store mapping for cancel/done reactions
  if (env.ISSUE_MAPPINGS && issueResult.issueId) {
    const mappingKey = `issue:${channel}:${messageTs}`;
    await env.ISSUE_MAPPINGS.put(mappingKey, JSON.stringify({
      issueId: issueResult.issueId,
      issueIdentifier: issueResult.issueIdentifier,
      createdBy: reactorUserId,
    }), { expirationTtl: 30 * 24 * 60 * 60 });
    console.log(`Stored issue mapping: ${mappingKey} -> ${issueResult.issueId}`);
  }

  if (issueResult.issueId && permalink) {
    await linearClient.linkSlackThread(issueResult.issueId, permalink, true);
  }

  // matchedProject는 위에서 이미 할당됨
  const projectLine = matchedProject ? `\n프로젝트: ${matchedProject.name}` : '';
  const estimateLine = finalResult.suggestedEstimate ? ` · ${finalResult.suggestedEstimate}pt` : '';
  const imageLine = collectedImages.length > 0 ? ` · 이미지 ${collectedImages.length}장` : '';

  const replyText = `Linear 이슈가 생성되었습니다! 프로젝트/Cycle을 정확히 수정해주세요
<${issueResult.issueUrl}|${issueResult.issueIdentifier}> ${finalResult.title}${estimateLine}${imageLine}${projectLine}`;

  await slackClient.postMessage(channel, replyText, threadTs || messageTs);
}

// ========== Analysis Result Merge ==========

interface MergedResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedPriority?: number;
  suggestedEstimate?: number;
  error?: string;
}

function mergeAnalysisResults(
  textResult: ThreadAnalysisResult,
  imageResult: ImageAnalysisResult | null,
  r2Urls: string[]
): MergedResult {
  // 이미지가 없으면 기존 텍스트 결과 그대로 반환
  if (!imageResult) {
    return textResult;
  }

  // 텍스트 실패 + 이미지 성공 → 이미지 결과 사용
  if (!textResult.success && imageResult.success) {
    let description = imageResult.description;
    if (r2Urls.length > 0) {
      description += '\n\n## 첨부 이미지\n' + r2Urls.map((url, i) => `![첨부 이미지 ${i + 1}](${url})`).join('\n');
    }
    return {
      title: imageResult.title,
      description,
      success: true,
      suggestedProjectId: imageResult.suggestedProjectId,
    };
  }

  // 텍스트 성공 (이미지 성공 여부 무관) → 텍스트 기반 + 이미지 보강
  if (textResult.success) {
    let description = textResult.description;

    // 이미지 분석 성공 시 설명에 섹션 추가
    if (imageResult.success && imageResult.description) {
      description += '\n\n## 이미지 분석\n' + imageResult.description;
    }

    // R2 URL이 있으면 이미지 첨부
    if (r2Urls.length > 0) {
      description += '\n\n## 첨부 이미지\n' + r2Urls.map((url, i) => `![첨부 이미지 ${i + 1}](${url})`).join('\n');
    }

    return {
      ...textResult,
      description,
    };
  }

  // 둘 다 실패
  return textResult;
}
