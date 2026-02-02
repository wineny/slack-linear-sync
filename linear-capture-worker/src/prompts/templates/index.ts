export interface PromptTemplates {
  imageRef: (count: number) => string;
  analyzeInstruction: string;
  titleRules: string;
  descriptionTemplate: string;
  userInstructionSection: (instruction: string) => string;
  contextSection: {
    header: string;
    projectsHeader: string;
    priorityHeader: string;
    priorityLevels: string;
    estimateHeader: string;
    estimateLevels: string;
    noProjects: string;
  };
  jsonFormat: {
    title: string;
    description: string;
  };
  slackAnalyze: string;
  slackPermalink: string;
  jsonFormatHeader: string;
  outputLanguageInstruction: string;
}

import { ko } from './ko.js';
import { en } from './en.js';
import { de } from './de.js';
import { fr } from './fr.js';
import { es } from './es.js';

const templates: Record<string, PromptTemplates> = { ko, en, de, fr, es };

export function getTemplates(language?: string): PromptTemplates {
  if (!language || !templates[language]) {
    return templates.ko;
  }
  return templates[language];
}
