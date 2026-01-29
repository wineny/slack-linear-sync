/**
 * Slack OAuth Module - User Token flow (required for search:read scope)
 */

import { storeTokens, getTokens, deleteTokens, type TokenStorageEnv, type OAuthTokens } from '../oauth/token-storage.js';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_CHANNELS_URL = 'https://slack.com/api/conversations.list';
const SLACK_AUTH_TEST_URL = 'https://slack.com/api/auth.test';

const USER_SCOPES = ['search:read', 'channels:read', 'users:read'];

export interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  authed_user?: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
  team?: {
    id: string;
    name: string;
  };
  error?: string;
}

export interface SlackAuthTestResponse {
  ok: boolean;
  url?: string;
  team?: string;
  user?: string;
  team_id?: string;
  user_id?: string;
  error?: string;
}

export interface SlackChannelsResponse {
  ok: boolean;
  channels?: Array<{
    id: string;
    name: string;
    is_private: boolean;
    is_member: boolean;
    num_members?: number;
  }>;
  response_metadata?: {
    next_cursor?: string;
  };
  error?: string;
}

export function handleSlackAuth(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Response {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const redirectUri = url.searchParams.get('redirect_uri');

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!redirectUri) {
    return new Response(
      JSON.stringify({ success: false, error: 'redirect_uri is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!env.SLACK_CLIENT_ID) {
    return new Response(
      JSON.stringify({ success: false, error: 'SLACK_CLIENT_ID not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const state = btoa(JSON.stringify({ device_id: deviceId }));

  const authUrl = new URL(SLACK_AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  authUrl.searchParams.set('user_scope', USER_SCOPES.join(','));
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  return new Response(
    JSON.stringify({ success: true, auth_url: authUrl.toString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleSlackCallback(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json() as {
      code?: string;
      redirect_uri?: string;
      state?: string;
    };

    const { code, redirect_uri, state } = body;

    if (!code) {
      return new Response(
        JSON.stringify({ success: false, error: 'code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!redirect_uri) {
      return new Response(
        JSON.stringify({ success: false, error: 'redirect_uri is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let deviceId: string;
    try {
      const stateData = JSON.parse(atob(state || ''));
      deviceId = stateData.device_id;
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid state parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!deviceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'device_id not found in state' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenResponse = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri,
      }).toString(),
    });

    const tokenData: SlackTokenResponse = await tokenResponse.json();

    if (!tokenData.ok || !tokenData.authed_user?.access_token) {
      console.error('Slack token exchange failed:', tokenData.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: tokenData.error || 'Failed to exchange code for token' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authTestResponse = await fetch(SLACK_AUTH_TEST_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.authed_user.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const authTestData: SlackAuthTestResponse = await authTestResponse.json();

    const tokens: OAuthTokens = {
      access_token: tokenData.authed_user.access_token,
      token_type: tokenData.authed_user.token_type || 'user',
      scope: tokenData.authed_user.scope,
      workspace_id: tokenData.team?.id,
      workspace_name: tokenData.team?.name,
      user_id: authTestData.user_id,
      user_name: authTestData.user,
    };

    await storeTokens(env, deviceId, 'slack', tokens);

    return new Response(
      JSON.stringify({
        success: true,
        workspace: {
          id: tokenData.team?.id,
          name: tokenData.team?.name,
        },
        user: {
          id: authTestData.user_id,
          name: authTestData.user,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack callback error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleSlackChannels(
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
    const channelsResponse = await fetch(
      `${SLACK_CHANNELS_URL}?types=public_channel,private_channel&exclude_archived=true&limit=200`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      }
    );

    const channelsData: SlackChannelsResponse = await channelsResponse.json();

    if (!channelsData.ok) {
      console.error('Slack channels fetch failed:', channelsData.error);
      
      if (channelsData.error === 'token_revoked' || channelsData.error === 'invalid_auth') {
        await deleteTokens(env, deviceId, 'slack');
        return new Response(
          JSON.stringify({ success: false, error: 'Slack token revoked. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: channelsData.error || 'Failed to fetch channels' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channels = (channelsData.channels || [])
      .filter(ch => ch.is_member)
      .map(ch => ({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private,
        num_members: ch.num_members,
      }));

    return new Response(
      JSON.stringify({
        success: true,
        channels,
        workspace: {
          id: tokens.workspace_id,
          name: tokens.workspace_name,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack channels error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleSlackStatus(
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
      JSON.stringify({ 
        success: true, 
        connected: false 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      connected: true,
      workspace: {
        id: tokens.workspace_id,
        name: tokens.workspace_name,
      },
      user: {
        id: tokens.user_id,
        name: tokens.user_name,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleSlackDisconnect(
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

  await deleteTokens(env, deviceId, 'slack');

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
