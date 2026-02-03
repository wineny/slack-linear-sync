import { getTokens, deleteTokens, type TokenStorageEnv } from '../oauth/token-storage.js';

const SLACK_HISTORY_URL = 'https://slack.com/api/conversations.history';
const SLACK_USERS_URL = 'https://slack.com/api/users.list';

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}

async function fetchUserMap(accessToken: string): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();
  try {
    const response = await fetch(SLACK_USERS_URL, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const data = await response.json() as { ok: boolean; members?: SlackUser[] };
    if (data.ok && data.members) {
      for (const user of data.members) {
        const displayName = user.profile?.display_name || user.profile?.real_name || user.real_name || user.name;
        userMap.set(user.id, displayName);
      }
    }
  } catch (error) {
    console.error('[fetchUserMap] Error:', error);
  }
  return userMap;
}

function resolveUserMentions(text: string, userMap: Map<string, string>): string {
  return text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
    const displayName = userMap.get(userId);
    return displayName ? `@${displayName}` : match;
  });
}

export interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export interface HistoryMessage {
  ts: string;
  text: string;
  user?: string;
  type: string;
}

export interface SlackHistoryResponse {
  ok: boolean;
  messages?: HistoryMessage[];
  has_more?: boolean;
  response_metadata?: {
    next_cursor?: string;
  };
  error?: string;
}

export async function handleSlackHistory(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const channelId = url.searchParams.get('channel_id');
  const oldest = url.searchParams.get('oldest');
  const limit = url.searchParams.get('limit') || '100';

  // Validate required params
  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!channelId) {
    return new Response(
      JSON.stringify({ success: false, error: 'channel_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get tokens
  const tokens = await getTokens(env, deviceId, 'slack');
  if (!tokens) {
    return new Response(
      JSON.stringify({ success: false, error: 'Not connected to Slack' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [historyResponse, userMap] = await Promise.all([
      fetch(`${SLACK_HISTORY_URL}?${new URLSearchParams({
        channel: channelId,
        limit,
        ...(oldest ? { oldest } : {}),
      }).toString()}`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      }),
      fetchUserMap(tokens.access_token),
    ]);

    const data: SlackHistoryResponse = await historyResponse.json();

    if (!data.ok) {
      console.error('Slack history failed:', data.error);

      if (data.error === 'token_revoked' || data.error === 'invalid_auth') {
        await deleteTokens(env, deviceId, 'slack');
        return new Response(
          JSON.stringify({ success: false, error: 'Slack token revoked. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (data.error === 'channel_not_found' || data.error === 'not_in_channel') {
        return new Response(
          JSON.stringify({ success: false, error: data.error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: data.error || 'Failed to fetch history' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages = (data.messages || []).map(msg => ({
      ...msg,
      text: msg.text ? resolveUserMentions(msg.text, userMap) : msg.text,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        messages,
        has_more: data.has_more || false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack history error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
