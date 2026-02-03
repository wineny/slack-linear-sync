/**
 * Stateless semantic search - no data stored.
 * Messages are embedded in-memory, searched, and discarded.
 */

export interface ContextItem {
  id: string;
  content: string;
  title?: string;
  url?: string;
  source: 'slack' | 'notion' | 'gmail';
  timestamp?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SearchRequest {
  query: string;
  items: ContextItem[];
  limit?: number;
}

export interface SearchResult extends ContextItem {
  score: number;
}

interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

export interface SearchEnv {
  OPENAI_API_KEY: string;
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_LIMIT = 5;

async function getEmbeddings(apiKey: string, texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function handleSearch(
  request: Request,
  env: SearchEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: SearchRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { query, items, limit = DEFAULT_LIMIT } = body;

  if (!query || typeof query !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'items array is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const textsToEmbed = [query, ...items.map(item => item.content)];
    const embeddings = await getEmbeddings(env.OPENAI_API_KEY, textsToEmbed);
    
    const queryEmbedding = embeddings[0];
    const itemEmbeddings = embeddings.slice(1);

    const results: SearchResult[] = items.map((item, index) => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, itemEmbeddings[index]),
    }));

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    const response: SearchResponse = { success: true, results: topResults };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
