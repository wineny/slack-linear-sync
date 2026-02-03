import type { VectorizeEnv, VectorMetadata, VectorSearchResult, VectorSource } from './index.js';
import { getVectorIndex, buildVectorId, truncateText } from './index.js';

const EMBEDDING_MODEL = '@cf/baai/bge-m3';
const BATCH_SIZE = 100;

export async function generateEmbedding(env: VectorizeEnv, text: string): Promise<number[]> {
  const truncated = truncateText(text, 500);
  const result = await env.AI.run(EMBEDDING_MODEL, { text: [truncated] });
  
  if ('data' in result && result.data) {
    return result.data[0];
  }
  throw new Error('Embedding generation failed: async response not supported');
}

export async function generateEmbeddings(env: VectorizeEnv, texts: string[]): Promise<number[][]> {
  const truncatedTexts = texts.map(t => truncateText(t, 500));
  const batches: string[][] = [];
  
  for (let i = 0; i < truncatedTexts.length; i += BATCH_SIZE) {
    batches.push(truncatedTexts.slice(i, i + BATCH_SIZE));
  }
  
  const results: number[][] = [];
  for (const batch of batches) {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: batch });
    if ('data' in result && result.data) {
      results.push(...result.data);
    } else {
      throw new Error('Embedding generation failed: async response not supported');
    }
  }
  
  return results;
}

export async function indexVectors(
  env: VectorizeEnv,
  source: VectorSource,
  records: Array<{ text: string; metadata: VectorMetadata }>
): Promise<{ indexed: number }> {
  if (records.length === 0) {
    return { indexed: 0 };
  }

  const texts = records.map(r => r.text);
  const embeddings = await generateEmbeddings(env, texts);
  
  const vectors: VectorizeVector[] = records.map((record, i) => ({
    id: buildVectorId(source, record.metadata.deviceId, record.metadata.sourceId),
    values: embeddings[i],
    metadata: record.metadata as Record<string, VectorizeVectorMetadata>,
  }));

  const index = getVectorIndex(env, source);
  
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
  }

  return { indexed: vectors.length };
}

export async function searchVectors(
  env: VectorizeEnv,
  source: VectorSource,
  deviceId: string,
  queryText: string,
  topK: number = 3
): Promise<VectorSearchResult[]> {
  const queryEmbedding = await generateEmbedding(env, queryText);
  const index = getVectorIndex(env, source);
  
  const results = await index.query(queryEmbedding, {
    topK,
    filter: { deviceId },
    returnMetadata: 'all',
  });

  return results.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata as unknown as VectorMetadata,
  }));
}

export async function searchAllSources(
  env: VectorizeEnv,
  deviceId: string,
  queryText: string,
  topKPerSource: number = 3
): Promise<VectorSearchResult[]> {
  const sources: VectorSource[] = ['gmail', 'slack', 'notion', 'linear'];
  const queryEmbedding = await generateEmbedding(env, queryText);
  
  const searchPromises = sources.map(async (source) => {
    const index = getVectorIndex(env, source);
    try {
      const results = await index.query(queryEmbedding, {
        topK: topKPerSource,
        returnMetadata: 'all',
      });
      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as unknown as VectorMetadata,
      }));
    } catch (error) {
      console.error(`Search error for ${source}:`, error);
      return [];
    }
  });

  const allResults = await Promise.all(searchPromises);
  const flattened = allResults.flat();
  
  return flattened.sort((a, b) => b.score - a.score);
}

export async function deleteVectorsByDevice(
  env: VectorizeEnv,
  source: VectorSource,
  deviceId: string,
  sourceIds: string[]
): Promise<void> {
  const index = getVectorIndex(env, source);
  const ids = sourceIds.map(sourceId => buildVectorId(source, deviceId, sourceId));
  await index.deleteByIds(ids);
}
