/**
 * OAuth Token Manager
 * Handles automatic token refresh for Linear OAuth
 */

interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;  // 새 refresh token (rotation 대응)
  error?: string;
}

/**
 * Refresh the OAuth access token using the refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenRefreshResult> {
  try {
    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.access_token) {
      return {
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,  // rotation된 새 refresh token
      };
    }

    return {
      success: false,
      error: data.error_description || data.error || 'Unknown error',
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Test if the current access token is valid
 */
export async function isTokenValid(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { id } }' }),
    });

    const data = await response.json() as { data?: { viewer?: { id: string } }; errors?: unknown[] };
    return !data.errors && !!data.data?.viewer;
  } catch {
    return false;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(
  kv: KVNamespace,
  clientId: string,
  clientSecret: string
): Promise<{ token: string | null; refreshed: boolean; error?: string }> {
  const accessToken = await kv.get('access_token');

  // No token at all
  if (!accessToken) {
    return { token: null, refreshed: false, error: 'No access token found' };
  }

  // Check if current token is valid
  if (await isTokenValid(accessToken)) {
    return { token: accessToken, refreshed: false };
  }

  // Token expired, try to refresh
  console.log('Access token expired, attempting refresh...');

  const refreshToken = await kv.get('refresh_token');
  if (!refreshToken) {
    return { token: null, refreshed: false, error: 'No refresh token available' };
  }

  const result = await refreshAccessToken(refreshToken, clientId, clientSecret);

  if (result.success && result.accessToken) {
    // Save new tokens to KV
    await kv.put('access_token', result.accessToken);

    // 새 refresh token이 있으면 저장 (rotation 대응)
    if (result.refreshToken) {
      await kv.put('refresh_token', result.refreshToken);
      console.log('Access token and refresh token rotated successfully');
    } else {
      console.log('Access token refreshed successfully');
    }

    return { token: result.accessToken, refreshed: true };
  }

  return { token: null, refreshed: false, error: result.error };
}
