export interface PromptContext {
  projects?: Array<{ id: string; name: string; description?: string; recentIssueTitles?: string[] }>;
  users?: Array<{ id: string; name: string }>;
  instruction?: string;
  language?: string;
}

export interface ImagePromptInput {
  type: 'image';
  imageCount: number;
}

export interface TextPromptInput {
  type: 'text';
  messages: Array<{ author: string; text: string }>;
  slackPermalink?: string;
}

export type PromptInput = ImagePromptInput | TextPromptInput;

export interface TextAnalysisRequest {
  messages: Array<{ author: string; text: string }>;
  context?: PromptContext;
  slackPermalink?: string;
}

export interface TextAnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedPriority?: number;
  error?: string;
}
