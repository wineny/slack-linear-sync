import type { PromptInput, PromptContext } from './types.js';
import { getTemplates } from './templates/index.js';

function buildInstructionSection(instruction: string | undefined, t: ReturnType<typeof getTemplates>): string {
  if (!instruction || instruction.trim() === '') return '';
  return t.userInstructionSection(instruction.trim());
}

function buildContextSection(context: PromptContext | undefined, t: ReturnType<typeof getTemplates>): string {
  if (!context) return '';

  const projectList = context.projects
    ?.map((p) => {
      let line = `- "${p.name}" (ID: ${p.id})${p.description ? ` - ${p.description}` : ''}`;
      if (p.recentIssueTitles?.length) {
        const titles = p.recentIssueTitles.slice(0, 5).join(', ');
        line += `\n  최근 이슈: ${titles}`;
      }
      return line;
    })
    .join('\n') || t.contextSection.noProjects;

  return `

${t.contextSection.header}

${t.contextSection.projectsHeader}
${projectList}

${t.contextSection.priorityHeader}
${t.contextSection.priorityLevels}

${t.contextSection.estimateHeader}
${t.contextSection.estimateLevels}`;
}

function buildJsonFormat(hasContext: boolean, t: ReturnType<typeof getTemplates>): string {
  if (hasContext) {
    return `{
  "title": "${t.jsonFormat.title}",
  "description": "${t.jsonFormat.description}",
  "projectId": "matching project ID or null",
  "priority": 3,
  "estimate": 2
}`;
  }
  return `{"title": "...", "description": "..."}`;
}

export function buildImagePrompt(imageCount: number, context?: PromptContext): string {
  const t = getTemplates(context?.language);
  const imageRef = t.imageRef(imageCount);
  const instructionSection = buildInstructionSection(context?.instruction, t);
  const contextSection = buildContextSection(context, t);
  const jsonFormat = buildJsonFormat(!!context, t);

  // Add output language instruction at the very beginning for non-default languages
  const languagePrefix = t.outputLanguageInstruction ? `${t.outputLanguageInstruction}\n\n` : '';

  return `${languagePrefix}${imageRef} ${t.analyzeInstruction}

${t.titleRules}
${instructionSection}
${t.descriptionTemplate}
${contextSection}

## ${t.jsonFormatHeader}
${jsonFormat}`;
}

export function buildTextPrompt(
  messages: Array<{ author: string; text: string }>,
  slackPermalink?: string,
  context?: PromptContext
): string {
  const t = getTemplates(context?.language);
  const conversationText = messages
    .map((m) => `**${m.author}**: ${m.text}`)
    .join('\n\n');

  const contextSection = buildContextSection(context, t);
  const jsonFormat = buildJsonFormat(!!context, t);
  const permalinkNote = slackPermalink
    ? `\n\n> ${t.slackPermalink}: ${slackPermalink}`
    : '';

  // Add output language instruction at the very beginning for non-default languages
  const languagePrefix = t.outputLanguageInstruction ? `${t.outputLanguageInstruction}\n\n` : '';

  return `${languagePrefix}${t.slackAnalyze}

## Conversation
${conversationText}
${permalinkNote}

${t.titleRules}

${t.descriptionTemplate}
${contextSection}

## ${t.jsonFormatHeader}
${jsonFormat}`;
}

export function buildIssuePrompt(input: PromptInput, context?: PromptContext): string {
  if (input.type === 'image') {
    return buildImagePrompt(input.imageCount, context);
  }
  return buildTextPrompt(input.messages, input.slackPermalink, context);
}
