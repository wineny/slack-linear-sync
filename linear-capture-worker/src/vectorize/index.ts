export type VectorSource = 'gmail' | 'slack' | 'notion' | 'linear';

type MetadataValue = string | number | boolean | string[];

export interface VectorMetadata {
  source: VectorSource;
  deviceId: string;
  title: string;
  url: string;
  snippet: string;
  timestamp: number;
  sourceId: string;
  [key: string]: MetadataValue;
}

export interface GmailVectorMetadata extends VectorMetadata {
  source: 'gmail';
  from: string;
  threadId: string;
}

export interface SlackVectorMetadata extends VectorMetadata {
  source: 'slack';
  channel: string;
  user: string;
  permalink: string;
}

export interface NotionVectorMetadata extends VectorMetadata {
  source: 'notion';
  pageId: string;
  lastEdited: string;
}

export interface LinearVectorMetadata extends VectorMetadata {
  source: 'linear';
  issueId: string;
  identifier: string;
  state: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorizeEnv {
  AI: Ai;
  GMAIL_VECTORS: VectorizeIndex;
  SLACK_VECTORS: VectorizeIndex;
  NOTION_VECTORS: VectorizeIndex;
  LINEAR_VECTORS: VectorizeIndex;
}

export function getVectorIndex(env: VectorizeEnv, source: VectorSource): VectorizeIndex {
  const indexMap: Record<VectorSource, VectorizeIndex> = {
    gmail: env.GMAIL_VECTORS,
    slack: env.SLACK_VECTORS,
    notion: env.NOTION_VECTORS,
    linear: env.LINEAR_VECTORS,
  };
  return indexMap[source];
}

export function buildVectorId(source: VectorSource, deviceId: string, sourceId: string): string {
  // Vectorize max ID length is 64 bytes
  // Use first 8 chars of deviceId to keep ID short
  const shortDeviceId = deviceId.slice(0, 8);
  return `${source}:${shortDeviceId}:${sourceId}`;
}

export function truncateText(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
