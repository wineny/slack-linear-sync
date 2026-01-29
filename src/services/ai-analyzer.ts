/**
 * AI analyzer using Anthropic Claude Haiku 4.5 for extracting issue title/description
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult, LinearProject, LinearUser } from '../types/index.js';

/**
 * Extract JSON from text using balanced braces tracking
 * Handles nested objects correctly
 */
function extractJSON(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

// ========== Shared Prompt Components (from linear-capture-worker) ==========

const TITLE_RULES = `## 제목 규칙 (매우 중요!)

**사내 협업 vs 외부 문의 구분 규칙**:

1. **사내 협업으로 판단되는 경우** (접두어 없이 내용만):
   - 슬랙, Teams 등 사내 메신저 UI가 보이는 경우
   - "팀", "프로젝트", "회의", "공유", "검토" 등 사내 업무 용어
   - 지피터스 팀 멤버 이름이 확인되는 경우
   - 특정 외부 회사명 없이 업무 요청만 있는 경우

   형식: 구체적인 요청 내용 (40자 이내, 접두어 없음)
   예시:
   - "워크샵 커리큘럼 검토 요청"
   - "레드팀 활용 툴 정리 & 공유"
   - "교육자료 20페이지 추가 작성"
   - "PPT 수정 및 내일까지 전달"

2. **외부 클라이언트 문의인 경우** (회사명 포함):
   - 외부 회사명이 명확히 보이는 경우
   - 이메일 도메인으로 회사 식별 가능한 경우
   - "견적", "제안", "계약", "발주" 등 외부 문의 키워드

   형식: [상대방회사] 구체적인 요청 내용 (40자 이내)
   예시:
   - "[현대차] 워크샵 커리큘럼 및 교육생 안내자료 요청"
   - "[삼성] AI활용 사내교육 견적 요청 (1/20까지)"
   - "[카카오] 맞춤형 워크샵 PPT 20페이지 추가 요청"

3. **불명확한 경우**:
   - 회사명이 없고 사내/외부 구분이 어려운 경우
   - [외부문의] 대신 내용만 작성 (과도한 분류 방지)

**주의사항**:
- "지피터스"는 우리 회사이므로 제목에 절대 포함하지 않음
- 불확실할 때는 접두어 없이 요청 내용만 작성
- [외부문의]는 정말 외부 클라이언트가 명확할 때만 사용
- 요청이 여러 개면 & 로 연결
- 마감일 있으면 포함`;

const DESCRIPTION_TEMPLATE = `## 설명 규칙 (불릿 포인트 필수!)
모든 내용을 불릿(-) 형식으로 작성하세요.

### 템플릿
## 요약
- (핵심 요청/문제를 한 줄로)

## 상세 내용
- (파악한 내용 1)
- (파악한 내용 2)
- (중요한 텍스트가 있으면 "인용" 형식으로)

## To Do
- [ ] (필요한 조치 사항 1)
- [ ] (필요한 조치 사항 2)`;

// ========== Thread Analysis Types ==========

export interface ThreadAnalysisContext {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    content?: string;
    keywords?: string[];
    teamName?: string;
    recentIssueTitles?: string[];
  }>;
  users: Array<{ id: string; name: string }>;
}

export interface ThreadAnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedPriority?: number;
  suggestedEstimate?: number;
  error?: string;
}

export class AIAnalyzer {
  private client: Anthropic;
  private model = 'claude-haiku-4-5-20251001';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Analyze a Slack question and generate Linear issue title/description
   */
  async analyzeQuestion(
    questionText: string,
    authorName: string,
    slackPermalink?: string
  ): Promise<AnalysisResult> {
    const prompt = `당신은 Slack 채널에 올라온 질문을 Linear 이슈로 변환하는 전문가입니다.

## 질문 원문
작성자: ${authorName}
내용:
${questionText}

## 작업 지침
1. 질문의 핵심을 파악하여 50자 이내의 간결한 제목을 작성하세요
2. 제목에는 관련 기술/도구명을 대괄호로 포함하세요 (예: [Claude Code], [MCP], [API])
3. 설명은 마크다운 형식으로 구조화하세요

## 출력 형식 (JSON)
{
  "title": "50자 이내 핵심 요약",
  "description": "마크다운 형식의 상세 설명"
}

## 설명 템플릿
\`\`\`markdown
## 배경
Slack \`00-ai개발-질문\` 채널에서 접수된 질문입니다.

## 질문 내용
- 핵심 질문 요약
- 관련 컨텍스트

## 원본 메시지
> 원문 인용

## 참고 자료
- Slack 스레드: ${slackPermalink || '[링크]'}
\`\`\`

JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { title: '', description: '', success: false, error: 'Unexpected response type' };
      }

      // Parse JSON from response using balanced braces
      const jsonString = extractJSON(content.text);
      if (!jsonString) {
        console.error('Failed to extract JSON from AI response:', content.text);
        return { title: '', description: '', success: false, error: 'Failed to parse JSON' };
      }

      let parsed: { title: string; description: string };
      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Extracted JSON string:', jsonString);
        console.error('Full AI response:', content.text);
        return {
          title: '',
          description: '',
          success: false,
          error: parseError instanceof Error ? parseError.message : 'JSON parse error'
        };
      }

      // Ensure Slack permalink is always included in description
      let finalDescription = parsed.description;
      if (slackPermalink && !finalDescription.includes(slackPermalink)) {
        finalDescription += `\n\n---\n📎 [Slack 원본 메시지](${slackPermalink})`;
      }

      return {
        title: parsed.title,
        description: finalDescription,
        success: true,
      };
    } catch (error) {
      console.error('AI analysis error:', error);
      return {
        title: '',
        description: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fallback: Generate basic title/description without AI
   */
  static fallbackAnalysis(
    questionText: string,
    authorName: string,
    slackPermalink?: string
  ): AnalysisResult {
    const firstLine = questionText.split('\n')[0];
    const title = firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;

    const description = `## 배경
Slack \`00-ai개발-질문\` 채널에서 접수된 질문입니다.

## 질문 내용
${questionText}

## 참고 자료
- 작성자: ${authorName}
${slackPermalink ? `- Slack 스레드: ${slackPermalink}` : ''}`;

    return { title, description, success: true };
  }

  async analyzeSlackThread(
    messages: Array<{ author: string; text: string; isTarget?: boolean }>,
    context?: ThreadAnalysisContext,
    slackPermalink?: string
  ): Promise<ThreadAnalysisResult> {
    // 타겟 메시지는 특별히 표시
    const conversationText = messages
      .map((m) => {
        if (m.isTarget) {
          return `>>> **[🎯 이슈 대상]** **${m.author}**: ${m.text}`;
        }
        return `**${m.author}**: ${m.text}`;
      })
      .join('\n\n');

    const contextSection = this.buildContextSection(context);
    const jsonFormat = context
      ? `{
  "title": "제목",
  "description": "설명 (마크다운)",
  "projectId": "매칭되는 프로젝트 ID 또는 null",
  "priority": 3,
  "estimate": 4
}`
      : `{"title": "...", "description": "..."}`;

    const permalinkNote = slackPermalink
      ? `\n\n> 원본 Slack 대화: ${slackPermalink}`
      : '';

    // 타겟 메시지가 있는지 확인
    const hasTargetMessage = messages.some((m) => m.isTarget);
    const targetMessageGuide = hasTargetMessage
      ? `## 🎯 이슈 대상 메시지 안내 (매우 중요!)
"[🎯 이슈 대상]"으로 표시된 메시지가 사용자가 이슈로 만들고 싶어하는 **핵심 내용**입니다.

**반드시 지켜야 할 규칙:**
- 제목과 설명은 **이슈 대상 메시지를 중심으로** 작성하세요
- 다른 메시지들은 대상 메시지를 이해하는 데 필요한 맥락(context)입니다
- 이슈 대상 메시지가 질문이면 → 질문을 이슈 제목으로
- 이슈 대상 메시지가 요청이면 → 요청 내용을 이슈 제목으로
- 이슈 대상 메시지가 답변이면 → 답변에서 파생된 후속 작업을 이슈로

`
      : '';

    const prompt = `다음 Slack 대화를 분석하여 Linear 이슈 정보를 생성하세요.

## 대화 내용
${conversationText}
${permalinkNote}

${targetMessageGuide}${TITLE_RULES}

${DESCRIPTION_TEMPLATE}
${contextSection}

## JSON 응답 형식 (마크다운 코드블록 없이):
${jsonFormat}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { title: '', description: '', success: false, error: 'Unexpected response type' };
      }

      const jsonString = extractJSON(content.text);
      if (!jsonString) {
        console.error('Failed to extract JSON from AI response:', content.text);
        return { title: '', description: '', success: false, error: 'Failed to parse JSON' };
      }

      let parsed: { title: string; description: string; projectId?: string | null; priority?: number; estimate?: number };
      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Extracted JSON string:', jsonString);
        console.error('Full AI response:', content.text);
        return {
          title: '',
          description: '',
          success: false,
          error: parseError instanceof Error ? parseError.message : 'JSON parse error'
        };
      }

      let finalDescription = parsed.description;
      if (slackPermalink && !finalDescription.includes(slackPermalink)) {
        finalDescription += `\n\n---\n📎 [Slack 원본 메시지](${slackPermalink})`;
      }

      return {
        title: parsed.title,
        description: finalDescription,
        success: true,
        suggestedProjectId: parsed.projectId || undefined,
        suggestedPriority: parsed.priority || 3,
        suggestedEstimate: parsed.estimate ?? 4,
      };
    } catch (error) {
      console.error('AI thread analysis error:', error);
      return {
        title: '',
        description: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildContextSection(context?: ThreadAnalysisContext): string {
    if (!context) return '';

    // 팀별 프로젝트 그룹핑
    const projectsByTeam: Record<string, typeof context.projects> = {};
    for (const p of context.projects || []) {
      const teamName = p.teamName || '기타';
      if (!projectsByTeam[teamName]) projectsByTeam[teamName] = [];
      projectsByTeam[teamName].push(p);
    }

    const sanitizeTitle = (title: string): string => {
      return title
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/"/g, "'")
        .slice(0, 80);
    };

    const projectList = Object.entries(projectsByTeam)
      .map(([team, projects]) => {
        const items = projects
          .map(p => {
            const kw = p.keywords?.slice(0, 5).join(', ') || '';
            const summary = p.description || '';
            const contentPreview = p.content?.slice(0, 400) || '';
            const projectInfo = summary || contentPreview 
              ? `\n    ${summary}${summary && contentPreview ? ' | ' : ''}${contentPreview.replace(/\n/g, ' ').trim()}`
              : '';
            const issues = p.recentIssueTitles
              ?.slice(0, 5)
              .map(t => sanitizeTitle(t))
              .join('", "') || '';
            const issueHint = issues ? `\n    최근 이슈: "${issues}"` : '';
            return `  - "${p.name}" (${p.id}) [${kw}]${projectInfo}${issueHint}`;
          })
          .join('\n');
        return `**[${team} 팀]**\n${items}`;
      })
      .join('\n\n') || '(없음)';

    const userList = context.users
      ?.map((u) => `- "${u.name}" (ID: ${u.id})`)
      .join('\n') || '(없음)';

    return `

## 프로젝트 선택 (필수!)

**반드시 하나의 프로젝트 ID를 선택하세요.** 기준:

1. **키워드 매칭**: 대화에 프로젝트명이나 관련 키워드가 있는가?
   - "Linear", "이슈", "자동화" → Linear 관련 프로젝트
   - "교육", "워크샵", "스터디", "강의" → 교육 관련 프로젝트
   - "Rona", "로나", "챗봇" → Rona 프로젝트
   - "랜딩", "마케팅", "콘텐츠" → 마케팅/콘텐츠 프로젝트
   - "개발", "코딩", "바이브", "인프라" → 개발 관련 프로젝트
   - **외부 기업/B2B**: 회사명, "고객사", "파트너사", "기업교육", "출강", "제안서", "견적" → "[상시] B2B 교육 기획 & 운영"

2. **팀 컨텍스트**:
   - 기술/개발/API → Product 팀 프로젝트
   - 교육/운영/커뮤니티 → Education 팀 프로젝트

3. **불확실하면**: 가장 포괄적인 프로젝트 선택 (예: "지피터스 커뮤니티 유지 및 관리")

**중요**: projectId에 반드시 ID 값을 넣으세요!

### 사용 가능한 프로젝트 (팀별)
${projectList}

### 사용 가능한 담당자
${userList}

### 우선순위 기준
- 1 (긴급): 에러, 장애, 긴급 요청
- 2 (높음): 중요한 버그, 빠른 처리 필요
- 3 (중간): 일반 요청, 개선사항 (기본값)
- 4 (낮음): 사소한 개선, 나중에 해도 됨

### Estimate (복잡도) 기준 - 지수 스케일
- 0: 없음 (단순 확인, 질문만)
- 1: 매우 간단 (설정 변경, 오타 수정)
- 2: 간단 (단일 파일 수정, 반나절 이내)
- 4: 보통 (기본값, 1일 작업)
- 8: 복잡 (여러 모듈 연동, 2-3일)
- 16: 매우 복잡 (새 기능 개발, 1주일 이상)`;
  }

  static fallbackThreadAnalysis(
    messages: Array<{ author: string; text: string }>,
    slackPermalink?: string
  ): ThreadAnalysisResult {
    const firstMessage = messages[0];
    const title = firstMessage.text.length > 50
      ? firstMessage.text.substring(0, 47) + '...'
      : firstMessage.text;

    const conversationText = messages
      .map((m) => `> **${m.author}**: ${m.text}`)
      .join('\n');

    const description = `## 요약
- Slack 대화에서 생성된 이슈입니다.

## 상세 내용
${conversationText}

## To Do
- [ ] 내용 확인 및 조치
${slackPermalink ? `\n---\n📎 [Slack 원본 메시지](${slackPermalink})` : ''}`;

    return { title, description, success: true };
  }
}
