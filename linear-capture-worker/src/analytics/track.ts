/**
 * Privacy: Only stores event type, anonymous device ID (first 8 chars), and numeric metadata.
 * Does NOT store: issue content, search queries, Slack messages, user data.
 */

export interface TrackRequest {
  event: 'app_open' | 'issue_created' | 'search_used' | 'context_linked' | 'api_error' | 'capture_failed' | 'analysis_failed' | 'tcc_reset' | 'onboarding_complete' | 'oauth_connected' | 'sync_completed';
  deviceId: string;
  metadata?: {
    imageCount?: number;
    hasContext?: boolean;
    contextSource?: string;
    version?: string;
    errorType?: string;
    message?: string;
    statusCode?: number;
    source?: string;
    resultCount?: number;
    itemsSynced?: number;
  };
}

interface TrackResponse {
  success: boolean;
  error?: string;
}

export interface AnalyticsEnv {
  ANALYTICS_KV?: KVNamespace;
}

const VALID_EVENTS = ['app_open', 'issue_created', 'search_used', 'context_linked', 'api_error', 'capture_failed', 'analysis_failed', 'tcc_reset', 'onboarding_complete', 'oauth_connected', 'sync_completed'] as const;
const DEVICE_ID_LENGTH = 8;
const TTL_DAYS = 90;

export async function handleTrack(
  request: Request,
  env: AnalyticsEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: TrackRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { event, deviceId, metadata } = body;

  if (!event || typeof event !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'event is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!deviceId || typeof deviceId !== 'string') {
    return new Response(
      JSON.stringify({ success: false, error: 'deviceId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!VALID_EVENTS.includes(event as typeof VALID_EVENTS[number])) {
    return new Response(
      JSON.stringify({ success: false, error: `Invalid event type. Valid: ${VALID_EVENTS.join(', ')}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const anonymizedDeviceId = deviceId.slice(0, DEVICE_ID_LENGTH);
    
    console.log(`[ANALYTICS] KV binding exists: ${!!env.ANALYTICS_KV}`);
    
    if (env.ANALYTICS_KV) {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timestamp = now.getTime();
      const key = `analytics:${date}:${event}:${anonymizedDeviceId}:${timestamp}`;
      
      const value = JSON.stringify({
        event,
        deviceId: anonymizedDeviceId,
        timestamp,
        metadata: metadata ? {
          imageCount: metadata.imageCount,
          hasContext: metadata.hasContext,
          contextSource: metadata.contextSource,
          version: metadata.version,
          errorType: metadata.errorType,
          message: metadata.message,
          statusCode: metadata.statusCode,
          source: metadata.source,
          resultCount: metadata.resultCount,
          itemsSynced: metadata.itemsSynced,
        } : undefined,
      });

      console.log(`[ANALYTICS] Saving to KV: key=${key}`);
      await env.ANALYTICS_KV.put(key, value, { expirationTtl: TTL_DAYS * 24 * 60 * 60 });
      console.log(`[ANALYTICS] KV put success`);
    }

    console.log(`[ANALYTICS] ${event} | device=${anonymizedDeviceId} | metadata=${JSON.stringify(metadata || {})}`);

    const response: TrackResponse = { success: true };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Track error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
