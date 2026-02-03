/**
 * Notion OAuth Module - Public Integration OAuth 2.0 flow
 * Supports refresh tokens for long-lived access
 */

import { storeTokens, getTokens, deleteTokens, type TokenStorageEnv, type OAuthTokens } from '../oauth/token-storage.js';

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

export interface NotionEnv extends TokenStorageEnv {
  NOTION_CLIENT_ID: string;
  NOTION_CLIENT_SECRET: string;
}

export interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner?: {
    type: 'user' | 'workspace';
    user?: {
      id: string;
      name?: string;
      avatar_url?: string;
      type?: string;
      person?: { email?: string };
    };
  };
  duplicated_template_id?: string | null;
  request_id?: string;
  // Notion now supports refresh tokens
  refresh_token?: string;
  expires_in?: number;
}

export interface NotionErrorResponse {
  error: string;
  error_description?: string;
  request_id?: string;
}

export function handleNotionAuth(
  request: Request,
  env: NotionEnv,
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

  if (!env.NOTION_CLIENT_ID) {
    return new Response(
      JSON.stringify({ success: false, error: 'NOTION_CLIENT_ID not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // State contains device_id for callback identification
  const state = btoa(JSON.stringify({ device_id: deviceId }));

  const authUrl = new URL(NOTION_AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', env.NOTION_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', state);

  return new Response(
    JSON.stringify({ success: true, auth_url: authUrl.toString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleNotionCallback(
  request: Request,
  env: NotionEnv,
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

    // Extract device_id from state
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

    // Notion uses Basic Auth for token exchange
    const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);

    const tokenResponse = await fetch(NOTION_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData: NotionErrorResponse = await tokenResponse.json();
      console.error('Notion token exchange failed:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorData.error_description || errorData.error || 'Failed to exchange code for token' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData: NotionTokenResponse = await tokenResponse.json();

    // Calculate expiration time if expires_in is provided
    const expiresAt = tokenData.expires_in 
      ? Math.floor(Date.now() / 1000) + tokenData.expires_in 
      : undefined;

    const tokens: OAuthTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      token_type: tokenData.token_type || 'bearer',
      workspace_id: tokenData.workspace_id,
      workspace_name: tokenData.workspace_name,
      workspace_icon: tokenData.workspace_icon,
      bot_id: tokenData.bot_id,
      user_id: tokenData.owner?.user?.id,
      user_name: tokenData.owner?.user?.name,
    };

    await storeTokens(env, deviceId, 'notion', tokens);

    return new Response(
      JSON.stringify({
        success: true,
        workspace: {
          id: tokenData.workspace_id,
          name: tokenData.workspace_name,
          icon: tokenData.workspace_icon,
        },
        user: tokenData.owner?.user ? {
          id: tokenData.owner.user.id,
          name: tokenData.owner.user.name,
        } : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Notion callback error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleNotionStatus(
  request: Request,
  env: NotionEnv,
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

  const tokens = await getTokens(env, deviceId, 'notion');
  
  if (!tokens) {
    return new Response(
      JSON.stringify({ 
        success: true, 
        connected: false 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if token is expired and needs refresh
  const isExpired = tokens.expires_at && tokens.expires_at < Math.floor(Date.now() / 1000);
  
  if (isExpired && tokens.refresh_token) {
    // Attempt to refresh the token
    const refreshResult = await refreshNotionToken(env, deviceId, tokens);
    if (!refreshResult.success) {
      // Token refresh failed, consider as disconnected
      return new Response(
        JSON.stringify({ 
          success: true, 
          connected: false,
          error: 'Token expired and refresh failed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      connected: true,
      workspace: {
        id: tokens.workspace_id,
        name: tokens.workspace_name,
        icon: tokens.workspace_icon,
      },
      user: tokens.user_id ? {
        id: tokens.user_id,
        name: tokens.user_name,
      } : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleNotionDisconnect(
  request: Request,
  env: NotionEnv,
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

  await deleteTokens(env, deviceId, 'notion');

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Refresh Notion access token using refresh token
 */
async function refreshNotionToken(
  env: NotionEnv,
  deviceId: string,
  currentTokens: OAuthTokens
): Promise<{ success: boolean; error?: string }> {
  if (!currentTokens.refresh_token) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);

    const response = await fetch(NOTION_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: currentTokens.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorData: NotionErrorResponse = await response.json();
      console.error('Notion token refresh failed:', errorData);
      
      // If refresh fails with invalid_grant, delete the tokens
      if (errorData.error === 'invalid_grant') {
        await deleteTokens(env, deviceId, 'notion');
      }
      
      return { success: false, error: errorData.error_description || errorData.error };
    }

    const tokenData: NotionTokenResponse = await response.json();
    
    const expiresAt = tokenData.expires_in 
      ? Math.floor(Date.now() / 1000) + tokenData.expires_in 
      : undefined;

    const newTokens: OAuthTokens = {
      ...currentTokens,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || currentTokens.refresh_token,
      expires_at: expiresAt,
    };

    await storeTokens(env, deviceId, 'notion', newTokens);
    
    return { success: true };
  } catch (error) {
    console.error('Notion token refresh error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get valid access token, refreshing if necessary
 * Used by other endpoints (like search) to ensure valid token
 */
export async function getValidNotionToken(
  env: NotionEnv,
  deviceId: string
): Promise<{ token: string } | { error: string }> {
  const tokens = await getTokens(env, deviceId, 'notion');
  
  if (!tokens) {
    return { error: 'Not connected to Notion' };
  }

  // Check if token is expired (with 5 minute buffer)
  const isExpired = tokens.expires_at && tokens.expires_at < Math.floor(Date.now() / 1000) + 300;
  
  if (isExpired && tokens.refresh_token) {
    const refreshResult = await refreshNotionToken(env, deviceId, tokens);
    if (!refreshResult.success) {
      return { error: refreshResult.error || 'Token refresh failed' };
    }
    // Get the updated tokens
    const updatedTokens = await getTokens(env, deviceId, 'notion');
    if (!updatedTokens) {
      return { error: 'Failed to get refreshed token' };
    }
    return { token: updatedTokens.access_token };
  }

  return { token: tokens.access_token };
}
