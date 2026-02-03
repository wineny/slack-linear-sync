/**
 * Notion Search Module - POST /v1/search API integration
 */

import { getValidNotionToken, type NotionEnv } from './oauth.js';

const NOTION_SEARCH_URL = 'https://api.notion.com/v1/search';
const NOTION_API_VERSION = '2022-06-28';

export interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  url: string;
  lastEditedTime: string;
  parentType: string;
}

export interface NotionSearchResponse {
  object: 'list';
  results: Array<{
    object: 'page' | 'database';
    id: string;
    url: string;
    icon?: {
      type: 'emoji' | 'external' | 'file';
      emoji?: string;
      external?: { url: string };
      file?: { url: string };
    } | null;
    parent: {
      type: string;
      database_id?: string;
      page_id?: string;
      workspace?: boolean;
    };
    properties: {
      title?: {
        type: 'title';
        title: Array<{ plain_text: string }>;
      };
      Name?: {
        type: 'title';
        title: Array<{ plain_text: string }>;
      };
      [key: string]: unknown;
    };
    last_edited_time: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionErrorResponse {
  object: 'error';
  code: string;
  message: string;
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

function extractIcon(icon: NotionSearchResponse['results'][0]['icon']): string | undefined {
  if (!icon) return undefined;
  if (icon.type === 'emoji' && icon.emoji) {
    return icon.emoji;
  }
  return undefined;
}

export async function handleNotionSearch(
  request: Request,
  env: NotionEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const query = url.searchParams.get('query') || '';
  const pageSize = url.searchParams.get('page_size') || '20';
  const filterType = url.searchParams.get('filter');

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
    const requestBody: {
      query?: string;
      page_size: number;
      sort?: { timestamp: string; direction: string };
      filter?: { property: string; value: string };
    } = {
      page_size: Math.min(parseInt(pageSize, 10), 100),
      sort: {
        timestamp: 'last_edited_time',
        direction: 'descending',
      },
    };

    if (query.trim()) {
      requestBody.query = query;
    }

    if (filterType === 'page' || filterType === 'database') {
      requestBody.filter = {
        property: 'object',
        value: filterType,
      };
    }

    const searchResponse = await fetch(NOTION_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
      body: JSON.stringify(requestBody),
    });

    if (!searchResponse.ok) {
      const errorData: NotionErrorResponse = await searchResponse.json();
      console.error('Notion search failed:', errorData);

      if (errorData.code === 'unauthorized' || errorData.code === 'invalid_token') {
        return new Response(
          JSON.stringify({ success: false, error: 'Notion token invalid. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Failed to search Notion',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData: NotionSearchResponse = await searchResponse.json();

    const pages: NotionPage[] = searchData.results
      .filter(item => item.object === 'page')
      .map(item => ({
        id: item.id,
        title: extractTitle(item.properties),
        icon: extractIcon(item.icon),
        url: item.url,
        lastEditedTime: item.last_edited_time,
        parentType: item.parent.type,
      }));

    return new Response(
      JSON.stringify({
        success: true,
        pages,
        total: pages.length,
        hasMore: searchData.has_more,
        nextCursor: searchData.next_cursor,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Notion search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
