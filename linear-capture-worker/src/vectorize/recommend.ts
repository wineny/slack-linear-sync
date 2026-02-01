import type { VectorizeEnv, VectorSearchResult } from './index.js';
import { searchAllSources } from './embeddings.js';

interface RecommendRequest {
  text: string;
  device_id: string;
  limit?: number;
}

interface Recommendation {
  source: string;
  title: string;
  snippet: string;
  score: number;
  url: string;
}

/**
 * 소스별 최소 1개 결과를 보장하면서 점수순으로 정렬
 * 1. 각 소스에서 최고 점수 결과 1개씩 선택 (MIN_SCORE 이상만)
 * 2. 나머지 슬롯은 전체 점수순으로 채움 (이미 선택된 결과 제외)
 */
function ensureSourceDiversity(
  results: VectorSearchResult[],
  minScore: number,
  limit: number
): VectorSearchResult[] {
  const MIN_SCORE = minScore;
  const filtered = results.filter((r) => r.score >= MIN_SCORE);

  if (filtered.length === 0) return [];

  // 소스별로 그룹화
  const sourceMap = new Map<string, VectorSearchResult[]>();
  for (const result of filtered) {
    const source = result.metadata.source;
    if (!sourceMap.has(source)) {
      sourceMap.set(source, []);
    }
    sourceMap.get(source)!.push(result);
  }

  // 각 소스에서 최고 점수 1개씩 선택
  const selected = new Set<VectorSearchResult>();
  const selectedIds = new Set<string>();

  for (const [, sourceResults] of sourceMap) {
    // 소스 내에서 점수순 정렬
    sourceResults.sort((a, b) => b.score - a.score);
    const topResult = sourceResults[0];
    selected.add(topResult);
    selectedIds.add(JSON.stringify(topResult));
  }

  // 선택된 결과를 배열로 변환하고 점수순 정렬
  const selectedArray = Array.from(selected).sort((a, b) => b.score - a.score);

  // 나머지 슬롯을 전체 점수순으로 채움
  if (selectedArray.length < limit) {
    const remaining = filtered.filter(
      (r) => !selectedIds.has(JSON.stringify(r))
    );
    remaining.sort((a, b) => b.score - a.score);

    for (const result of remaining) {
      if (selectedArray.length >= limit) break;
      selectedArray.push(result);
    }
  }

  return selectedArray.slice(0, limit);
}

export async function handleRecommend(
  request: Request,
  env: VectorizeEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: RecommendRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { text: rawText, device_id: deviceId, limit = 5 } = body;
  const text = rawText.toUpperCase();

  if (!text || typeof text !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'text is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!deviceId || typeof deviceId !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const results = await searchAllSources(env, deviceId, text, 5);
    
    const MIN_SCORE = 0.55;
    const diverseResults = ensureSourceDiversity(results, MIN_SCORE, limit);
    
    const recommendations: Recommendation[] = diverseResults.map(
      (r: VectorSearchResult) => ({
        source: r.metadata.source,
        title: r.metadata.title,
        snippet: r.metadata.snippet,
        score: r.score,
        url: r.metadata.url,
      })
    );

    return new Response(
      JSON.stringify({ success: true, recommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Recommend error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
