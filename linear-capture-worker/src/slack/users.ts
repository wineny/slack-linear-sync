import { getTokens, type TokenStorageEnv } from '../oauth/token-storage.js';

const SLACK_USERS_URL = 'https://slack.com/api/users.list';

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}

export interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export async function handleSlackUsers(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
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
    const response = await fetch(SLACK_USERS_URL, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    const data = await response.json() as {
      ok: boolean;
      members?: SlackUser[];
      error?: string;
    };

    if (!data.ok) {
      return new Response(
        JSON.stringify({ success: false, error: data.error || 'Failed to fetch users' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const users = (data.members || []).map(user => ({
      id: user.id,
      name: user.profile?.display_name || user.profile?.real_name || user.real_name || user.name,
    }));

    return new Response(
      JSON.stringify({ success: true, users }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack users error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
