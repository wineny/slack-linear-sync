/**
 * Slack Search Module - search.messages API integration
 */

import { getTokens, deleteTokens, type TokenStorageEnv, type OAuthTokens } from '../oauth/token-storage.js';

const SLACK_SEARCH_URL = 'https://slack.com/api/search.messages';

function resolveUserMentionsInSearch(text: string): string {
  return text.replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1');
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text?: string }>;
}

function extractTextFromBlocks(blocks?: SlackBlock[]): string {
  if (!blocks || blocks.length === 0) return '';
  
  const texts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'section' && block.text?.text) {
      texts.push(block.text.text);
    } else if (block.type === 'context' && block.elements) {
      for (const el of block.elements) {
        if (el.text) texts.push(el.text);
      }
    }
  }
  return texts.join('\n').replace(/<[^>]+>/g, '').trim();
}

export interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export interface SlackMessage {
  text: string;
  user?: string;
  username?: string;
  channel?: {
    id: string;
    name: string;
  };
  ts?: string;
  permalink?: string;
}

export interface SlackSearchResponse {
  ok: boolean;
  messages?: {
    total: number;
    matches: Array<{
      text: string;
      user?: string;
      username?: string;
      channel?: {
        id: string;
        name: string;
      };
      ts?: string;
      permalink?: string;
      blocks?: SlackBlock[];
    }>;
  };
  error?: string;
}

export async function handleSlackSearch(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const query = url.searchParams.get('query');
  const count = url.searchParams.get('count') || '20';
  const channelsParam = url.searchParams.get('channels');

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!query) {
    return new Response(
      JSON.stringify({ success: false, error: 'query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokens = await getTokens(env, deviceId, 'slack');
  if (!tokens) {
    return new Response(
      JSON.stringify({ success: false, error: 'Not connected to Slack' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    let searchQuery = query;
    if (channelsParam) {
      const channels = channelsParam.split(',').map(ch => `in:${ch}`).join(' OR ');
      searchQuery = `${query} (${channels})`;
    }

    const searchParams = new URLSearchParams({
      query: searchQuery,
      count,
      sort: 'timestamp',
      sort_dir: 'desc',
    });

    const searchResponse = await fetch(
      `${SLACK_SEARCH_URL}?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      }
    );

    const searchData: SlackSearchResponse = await searchResponse.json();

    if (!searchData.ok) {
      console.error('Slack search failed:', searchData.error);

      if (searchData.error === 'token_revoked' || searchData.error === 'invalid_auth') {
        await deleteTokens(env, deviceId, 'slack');
        return new Response(
          JSON.stringify({ success: false, error: 'Slack token revoked. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: searchData.error || 'Failed to search messages',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages: SlackMessage[] = (searchData.messages?.matches || []).map(match => {
      let text = match.text || '';
      if (!text && match.blocks) {
        text = extractTextFromBlocks(match.blocks);
      }
      return {
        text: resolveUserMentionsInSearch(text),
        user: match.user,
        username: match.username,
        channel: match.channel,
        ts: match.ts,
        permalink: match.permalink,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        messages,
        total: searchData.messages?.total || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
