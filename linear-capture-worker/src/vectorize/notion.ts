import type { NotionVectorMetadata, VectorizeEnv } from './index.js';
import { indexVectors } from './embeddings.js';
import { getValidNotionToken, type NotionEnv } from '../notion/oauth.js';

const NOTION_SEARCH_URL = 'https://api.notion.com/v1/search';
const NOTION_API_VERSION = '2022-06-28';

interface NotionSearchResponse {
  results: Array<{
    object: 'page' | 'database';
    id: string;
    url: string;
    properties: {
      title?: { type: 'title'; title: Array<{ plain_text: string }> };
      Name?: { type: 'title'; title: Array<{ plain_text: string }> };
      [key: string]: unknown;
    };
    last_edited_time: string;
  }>;
  has_more: boolean;
}

function extractTitle(properties: NotionSearchResponse['results'][0]['properties']): string {
  const titleProp = properties.title || properties.Name;
  if (titleProp && titleProp.type === 'title' && titleProp.title) {
    return titleProp.title.map(t => t.plain_text).join('') || 'Untitled';
  }

  for (const [, value] of Object.entries(properties)) {
    if (value && typeof value === 'object' && 'type' in value && value.type === 'title' && 'title' in value) {
      const titleValue = value as { type: 'title'; title: Array<{ plain_text: string }> };
      return titleValue.title.map(t => t.plain_text).join('') || 'Untitled';
    }
  }

  return 'Untitled';
}

export async function handleNotionIndex(
  request: Request,
  env: NotionEnv & VectorizeEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const pageSize = parseInt(url.searchParams.get('page_size') || '100', 10);

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokenResult = await getValidNotionToken(env, deviceId);
  if ('error' in tokenResult) {
    return new Response(
      JSON.stringify({ success: false, error: tokenResult.error }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const searchResponse = await fetch(NOTION_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
      body: JSON.stringify({
        page_size: Math.min(pageSize, 100),
        filter: { property: 'object', value: 'page' },
        sort: { timestamp: 'last_edited_time', direction: 'descending' },
      }),
    });

    if (!searchResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch pages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData: NotionSearchResponse = await searchResponse.json();
    const records: Array<{ text: string; metadata: NotionVectorMetadata }> = [];

    for (const page of searchData.results) {
      if (page.object !== 'page') continue;

      const title = extractTitle(page.properties);
      const timestamp = new Date(page.last_edited_time).getTime();

      records.push({
        text: title,
        metadata: {
          source: 'notion',
          deviceId,
          sourceId: page.id,
          title,
          url: page.url,
          snippet: title,
          timestamp,
          pageId: page.id,
          lastEdited: page.last_edited_time,
        },
      });
    }

    const result = await indexVectors(env, 'notion', records);

    return new Response(
      JSON.stringify({ success: true, indexed: result.indexed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Notion index error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
