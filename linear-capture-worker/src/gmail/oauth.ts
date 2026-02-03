/**
 * Gmail OAuth Module - Google OAuth 2.0 flow with refresh token support
 */

import { storeTokens, getTokens, deleteTokens, type TokenStorageEnv, type OAuthTokens } from '../oauth/token-storage.js';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface GmailEnv extends TokenStorageEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleErrorResponse {
  error: string;
  error_description?: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export function handleGmailAuth(
  request: Request,
  env: GmailEnv,
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

  if (!env.GOOGLE_CLIENT_ID) {
    return new Response(
      JSON.stringify({ success: false, error: 'GOOGLE_CLIENT_ID not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // State contains device_id for callback identification
  const state = btoa(JSON.stringify({ device_id: deviceId }));

  const authUrl = new URL(GOOGLE_AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_SCOPE);
  authUrl.searchParams.set('access_type', 'offline'); // Required for refresh token
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
  authUrl.searchParams.set('state', state);

  return new Response(
    JSON.stringify({ success: true, auth_url: authUrl.toString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleGmailCallback(
  request: Request,
  env: GmailEnv,
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

    // Google uses POST body for token exchange (not Basic Auth)
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData: GoogleErrorResponse = await tokenResponse.json();
      console.error('Google token exchange failed:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorData.error_description || errorData.error || 'Failed to exchange code for token' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    // Calculate expiration time: expires_in is in seconds
    const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

    // Fetch user info to get email
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    let userInfo: GoogleUserInfo | null = null;
    if (userInfoResponse.ok) {
      userInfo = await userInfoResponse.json();
    } else {
      console.error('Failed to fetch Google user info:', await userInfoResponse.text());
    }

    const tokens: OAuthTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      token_type: tokenData.token_type || 'Bearer',
      scope: tokenData.scope,
      user_email: userInfo?.email,
      user_name: userInfo?.name,
      user_id: userInfo?.id,
    };

    await storeTokens(env, deviceId, 'gmail', tokens);

    return new Response(
      JSON.stringify({
        success: true,
        user: userInfo ? {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
        } : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Gmail callback error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

export async function handleGmailStatus(
  request: Request,
  env: GmailEnv,
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

  const tokens = await getTokens(env, deviceId, 'gmail');
  
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
    const refreshResult = await refreshGmailToken(env, deviceId, tokens);
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
      user: {
        id: tokens.user_id,
        email: tokens.user_email,
        name: tokens.user_name,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export async function handleGmailDisconnect(
  request: Request,
  env: GmailEnv,
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

  await deleteTokens(env, deviceId, 'gmail');

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Refresh Gmail access token using refresh token
 */
async function refreshGmailToken(
  env: GmailEnv,
  deviceId: string,
  currentTokens: OAuthTokens
): Promise<{ success: boolean; error?: string }> {
  if (!currentTokens.refresh_token) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    // Google uses POST body for token refresh (not Basic Auth)
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: currentTokens.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorData: GoogleErrorResponse = await response.json();
      console.error('Gmail token refresh failed:', errorData);
      
      // If refresh fails with invalid_grant, delete the tokens
      if (errorData.error === 'invalid_grant') {
        await deleteTokens(env, deviceId, 'gmail');
      }
      
      return { success: false, error: errorData.error_description || errorData.error };
    }

    const tokenData: GoogleTokenResponse = await response.json();
    
    const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

    const newTokens: OAuthTokens = {
      ...currentTokens,
      access_token: tokenData.access_token,
      // Google may or may not return a new refresh token
      refresh_token: tokenData.refresh_token || currentTokens.refresh_token,
      expires_at: expiresAt,
    };

    await storeTokens(env, deviceId, 'gmail', newTokens);
    
    return { success: true };
  } catch (error) {
    console.error('Gmail token refresh error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get valid access token, refreshing if necessary
 * Used by other endpoints (like search) to ensure valid token
 */
export async function getValidGmailToken(
  env: GmailEnv,
  deviceId: string
): Promise<{ token: string } | { error: string }> {
  const tokens = await getTokens(env, deviceId, 'gmail');
  
  if (!tokens) {
    return { error: 'Not connected to Gmail' };
  }

  // Check if token is expired (with 5 minute buffer)
  const isExpired = tokens.expires_at && tokens.expires_at < Math.floor(Date.now() / 1000) + 300;
  
  if (isExpired && tokens.refresh_token) {
    const refreshResult = await refreshGmailToken(env, deviceId, tokens);
    if (!refreshResult.success) {
      return { error: refreshResult.error || 'Token refresh failed' };
    }
    // Get the updated tokens
    const updatedTokens = await getTokens(env, deviceId, 'gmail');
    if (!updatedTokens) {
      return { error: 'Failed to get refreshed token' };
    }
    return { token: updatedTokens.access_token };
  }

  return { token: tokens.access_token };
}
