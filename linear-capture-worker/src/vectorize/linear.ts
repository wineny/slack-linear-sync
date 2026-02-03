import type { LinearVectorMetadata, VectorizeEnv } from './index.js';
import { indexVectors } from './embeddings.js';

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  state: { name: string };
  updatedAt: string;
}

interface LinearIndexRequest {
  device_id: string;
  issues: LinearIssue[];
}

export async function handleLinearIndex(
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

  let body: LinearIndexRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { device_id: deviceId, issues } = body;

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!issues || !Array.isArray(issues)) {
    return new Response(
      JSON.stringify({ success: false, error: 'issues array is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const records: Array<{ text: string; metadata: LinearVectorMetadata }> = [];

    for (const issue of issues) {
      const text = `${issue.title} ${issue.description || ''}`.trim();
      const timestamp = new Date(issue.updatedAt).getTime();

      records.push({
        text,
        metadata: {
          source: 'linear',
          deviceId,
          sourceId: issue.id,
          title: issue.title,
          url: issue.url,
          snippet: (issue.description || '').slice(0, 200),
          timestamp,
          issueId: issue.id,
          identifier: issue.identifier,
          state: issue.state.name,
        },
      });
    }

    const result = await indexVectors(env, 'linear', records);

    return new Response(
      JSON.stringify({ success: true, indexed: result.indexed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Linear index error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
