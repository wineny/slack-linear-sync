/**
 * AI analyzer using Anthropic Claude Haiku 4.5 for extracting issue title/description
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisResult } from '../types/index.js';

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

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { title: '', description: '', success: false, error: 'Failed to parse JSON' };
      }

      const parsed = JSON.parse(jsonMatch[0]) as { title: string; description: string };

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
    // Extract first line or first 50 chars as title
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
}
