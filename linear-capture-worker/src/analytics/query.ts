import type { AnalyticsEnv } from './track.js';

export interface AnalyticsQueryEnv extends AnalyticsEnv {
  ANALYTICS_API_KEY: string;
}

interface AnalyticsEntry {
  event: string;
  deviceId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export async function handleAnalyticsQuery(
  request: Request,
  env: AnalyticsQueryEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ANALYTICS_API_KEY}`) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!env.ANALYTICS_KV) {
    return new Response(
      JSON.stringify({ success: false, error: 'Analytics KV not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const rangeParam = Math.min(parseInt(url.searchParams.get('range') || '7', 10), 30);
  const eventFilter = url.searchParams.get('event');
  const format = url.searchParams.get('format') || 'summary';

  const dates: string[] = [];
  const endDate = new Date(dateParam + 'T00:00:00Z');
  for (let i = 0; i < rangeParam; i++) {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const allEntries: AnalyticsEntry[] = [];

  for (const date of dates) {
    const prefix = `analytics:${date}:`;
    let cursor: string | undefined;

    do {
      const listResult = await env.ANALYTICS_KV.list({ prefix, cursor, limit: 1000 });
      for (const key of listResult.keys) {
        if (eventFilter) {
          const parts = key.name.split(':');
          if (parts[2] !== eventFilter) continue;
        }
        const value = await env.ANALYTICS_KV.get(key.name);
        if (value) {
          try {
            allEntries.push(JSON.parse(value) as AnalyticsEntry);
          } catch {
            // skip malformed entries
          }
        }
      }
      cursor = listResult.list_complete ? undefined : listResult.cursor;
    } while (cursor);
  }

  if (format === 'raw') {
    return new Response(
      JSON.stringify({
        success: true,
        range: { from: dates[dates.length - 1], to: dates[0] },
        events: allEntries,
        totalEvents: allEntries.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // summary format
  const summary: Record<string, number> = {};
  const uniqueDevices = new Set<string>();

  for (const entry of allEntries) {
    summary[entry.event] = (summary[entry.event] || 0) + 1;
    uniqueDevices.add(entry.deviceId);
  }

  return new Response(
    JSON.stringify({
      success: true,
      range: { from: dates[dates.length - 1], to: dates[0] },
      summary,
      uniqueDevices: uniqueDevices.size,
      totalEvents: allEntries.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
