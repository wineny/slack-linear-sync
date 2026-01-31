import type { PromptInput, PromptContext } from './types.js';

/**
 * Get language instruction for dynamic output language
 * Korean is the default (no additional instruction needed)
 */
function getLanguageInstruction(language?: string): string {
  if (!language || language === 'ko') return '';
  
  const langNames: Record<string, string> = {
    en: 'English',
    ko: 'Korean',
    ja: 'Japanese',
    zh: 'Chinese',
  };
  
  const langName = langNames[language] || 'English';
  
  if (language === 'en') {
    return `**CRITICAL: Write EVERYTHING in English. This includes:**
- Title
- All section headings (use "## Summary", "## Details", "## To Do" instead of Korean)
- All content and descriptions
- Do NOT use any Korean text anywhere in the output.

`;
  }
  
  return `**IMPORTANT: Write ALL output (title and description) in ${langName}. Do NOT use Korean.**

`;
}

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

function buildInstructionSection(instruction?: string): string {
  if (!instruction || instruction.trim() === '') return '';
  return `

---
## ⚠️ 사용자 지시사항 (최우선 반영 필수!)
다음 내용을 반드시 제목과 설명에 반영하세요:

> ${instruction.trim()}

이 지시사항이 있으면 스크린샷 내용보다 우선하여 이슈를 작성하세요.
---`;
}

function buildContextSection(context?: PromptContext): string {
  if (!context) return '';

  const projectList = context.projects
    ?.map((p) => `- "${p.name}" (ID: ${p.id})${p.description ? ` - ${p.description}` : ''}`)
    .join('\n') || '(없음)';

  return `

## 추가 분석
내용을 종합하여 가장 적합한 값을 선택하세요.

### 사용 가능한 프로젝트
${projectList}

### 우선순위 기준
- 1 (긴급): 에러, 장애, 긴급 요청
- 2 (높음): 중요한 버그, 빠른 처리 필요
- 3 (중간): 일반 요청, 개선사항 (기본값)
- 4 (낮음): 사소한 개선, 나중에 해도 됨

### 포인트 기준 (작업량 추정)
- 1: 아주 작음 (설정 변경, 텍스트 수정)
- 2: 작음 (간단한 버그 수정)
- 3: 중간 (기능 수정)
- 5: 큼 (새 기능 개발)
- 8: 매우 큼 (대규모 작업)`;
}

function buildJsonFormat(hasContext: boolean): string {
  if (hasContext) {
    return `{
  "title": "제목",
  "description": "설명 (마크다운)",
  "projectId": "매칭되는 프로젝트 ID 또는 null",
  "priority": 3,
  "estimate": 2
}`;
  }
  return `{"title": "...", "description": "..."}`;
}

export function buildImagePrompt(imageCount: number, context?: PromptContext): string {
  const imageRef = imageCount > 1 ? `${imageCount}개의 스크린샷을` : '이 스크린샷을';
  const languageInstruction = getLanguageInstruction(context?.language);
  const instructionSection = buildInstructionSection(context?.instruction);
  const contextSection = buildContextSection(context);
  const jsonFormat = buildJsonFormat(!!context);

  // instruction이 있으면 프롬프트 최상단에 배치하여 가중치 강화
  if (instructionSection) {
    return `${languageInstruction}${instructionSection}

${imageRef} 분석하여 Linear 이슈 정보를 생성하세요.

${TITLE_RULES}

${DESCRIPTION_TEMPLATE}
${contextSection}

## JSON 응답 형식 (마크다운 코드블록 없이):
${jsonFormat}`;
  }

  return `${languageInstruction}${imageRef} 분석하여 Linear 이슈 정보를 생성하세요.

${TITLE_RULES}

${DESCRIPTION_TEMPLATE}
${contextSection}

## JSON 응답 형식 (마크다운 코드블록 없이):
${jsonFormat}`;
}

export function buildTextPrompt(
  messages: Array<{ author: string; text: string }>,
  slackPermalink?: string,
  context?: PromptContext
): string {
  const conversationText = messages
    .map((m) => `**${m.author}**: ${m.text}`)
    .join('\n\n');

  const languageInstruction = getLanguageInstruction(context?.language);
  const contextSection = buildContextSection(context);
  const jsonFormat = buildJsonFormat(!!context);
  const permalinkNote = slackPermalink
    ? `\n\n> 원본 Slack 대화: ${slackPermalink}`
    : '';

  return `${languageInstruction}다음 Slack 대화를 분석하여 Linear 이슈 정보를 생성하세요.

## 대화 내용
${conversationText}
${permalinkNote}

${TITLE_RULES}

${DESCRIPTION_TEMPLATE}
${contextSection}

## JSON 응답 형식 (마크다운 코드블록 없이):
${jsonFormat}`;
}

export function buildIssuePrompt(input: PromptInput, context?: PromptContext): string {
  if (input.type === 'image') {
    return buildImagePrompt(input.imageCount, context);
  }
  return buildTextPrompt(input.messages, input.slackPermalink, context);
}
