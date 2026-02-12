/**
 * IssueIt Daily Report Service
 *
 * Fetches Mixpanel events, aggregates key IssueIt metrics,
 * and sends a daily Slack DM report.
 */

import { SlackClient } from './slack-client.js';
import type { Env } from '../types/index.js';

// --- Types ---

interface MixpanelEvent {
  event: string;
  properties: {
    distinct_id: string;
    time: number;
    [key: string]: unknown;
  };
}

interface KeyMetric {
  count: number;
  users: number;
  prevCount: number;
  prevUsers: number;
}

interface IssueItMetrics {
  uniqueUsers: number;
  prevUniqueUsers: number;
  appOpen: KeyMetric;
  issueCreated: KeyMetric;
  captureFailed: KeyMetric;
}

// --- Mixpanel Export API ---

async function fetchMixpanelEvents(
  apiSecret: string,
  fromDate: string,
  toDate: string
): Promise<MixpanelEvent[]> {
  const url = new URL('https://data.mixpanel.com/api/2.0/export');
  url.searchParams.set('from_date', fromDate);
  url.searchParams.set('to_date', toDate);

  const auth = btoa(`${apiSecret}:`);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    throw new Error(`Mixpanel API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  if (!text.trim()) return [];

  return text
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as MixpanelEvent)
    .filter((e) => e.event.startsWith('capture_'));
}

// --- Aggregation ---

function countMetric(events: MixpanelEvent[], eventName: string): { count: number; users: number } {
  const users = new Set<string>();
  let count = 0;
  for (const e of events) {
    if (e.event === eventName) {
      count++;
      users.add(e.properties.distinct_id);
    }
  }
  return { count, users: users.size };
}

function aggregateMetrics(
  todayEvents: MixpanelEvent[],
  prevEvents: MixpanelEvent[]
): IssueItMetrics {
  const todayUsers = new Set(todayEvents.map((e) => e.properties.distinct_id));
  const prevUsers = new Set(prevEvents.map((e) => e.properties.distinct_id));

  const todayApp = countMetric(todayEvents, 'capture_app_open');
  const prevApp = countMetric(prevEvents, 'capture_app_open');
  const todayIssue = countMetric(todayEvents, 'capture_issue_created');
  const prevIssue = countMetric(prevEvents, 'capture_issue_created');
  const todayFail = countMetric(todayEvents, 'capture_capture_failed');
  const prevFail = countMetric(prevEvents, 'capture_capture_failed');

  return {
    uniqueUsers: todayUsers.size,
    prevUniqueUsers: prevUsers.size,
    appOpen: { ...todayApp, prevCount: prevApp.count, prevUsers: prevApp.users },
    issueCreated: { ...todayIssue, prevCount: prevIssue.count, prevUsers: prevIssue.users },
    captureFailed: { ...todayFail, prevCount: prevFail.count, prevUsers: prevFail.users },
  };
}

// --- Slack message formatting ---

function formatSlackMessage(metrics: IssueItMetrics, dateStr: string): string {
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
  const [, m, d] = dateStr.split('-');

  const lines: string[] = [];

  lines.push(`*:camera_with_flash: IssueIt — ${Number(m)}/${Number(d)} (${dayOfWeek})*`);
  lines.push('');
  lines.push(`• *유저* ${metrics.uniqueUsers}명${diff(metrics.uniqueUsers - metrics.prevUniqueUsers)}`);
  lines.push(`• *앱 실행* ${fmtMetric(metrics.appOpen)}`);
  lines.push(`• *이슈 생성* ${fmtMetric(metrics.issueCreated)}`);

  if (metrics.captureFailed.count > 0) {
    lines.push(`• *캡처 실패* ${fmtMetric(metrics.captureFailed)}`);
  }

  return lines.join('\n');
}

function fmtMetric(m: KeyMetric): string {
  return `${m.count}건${diff(m.count - m.prevCount)} / ${m.users}명${diff(m.users - m.prevUsers)}`;
}

function diff(n: number): string {
  if (n > 0) return `(+${n})`;
  if (n < 0) return `(${n})`;
  return '';
}

// --- Date helpers ---

function getKSTDateString(daysOffset = 0): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() + daysOffset);
  return kst.toISOString().split('T')[0];
}

// --- Main export ---

export async function reportDailyIssueItMetrics(env: Env): Promise<void> {
  const apiSecret = env.MIXPANEL_API_SECRET;
  const channel = env.DAILY_REPORT_CHANNEL;

  if (!apiSecret || !channel) {
    console.log('[IssueIt Report] Missing MIXPANEL_API_SECRET or DAILY_REPORT_CHANNEL, skipping');
    return;
  }

  try {
    const yesterday = getKSTDateString(-1);
    const dayBefore = getKSTDateString(-2);

    const [todayEvents, prevEvents] = await Promise.all([
      fetchMixpanelEvents(apiSecret, yesterday, yesterday),
      fetchMixpanelEvents(apiSecret, dayBefore, dayBefore),
    ]);

    if (todayEvents.length === 0) {
      console.log('[IssueIt Report] No events for', yesterday);
      const slack = new SlackClient(env.SLACK_BOT_TOKEN);
      await slack.postMessage(channel, `*:camera_with_flash: IssueIt — ${yesterday}*\n\n이벤트 없음`);
      return;
    }

    const metrics = aggregateMetrics(todayEvents, prevEvents);
    const message = formatSlackMessage(metrics, yesterday);

    const slack = new SlackClient(env.SLACK_BOT_TOKEN);
    const result = await slack.postMessage(channel, message);

    if (!result.ok) {
      console.error('[IssueIt Report] Slack send failed:', result.error);
    } else {
      console.log(`[IssueIt Report] Sent: ${metrics.uniqueUsers} users, ${metrics.issueCreated.count} issues`);
    }
  } catch (error) {
    console.error('[IssueIt Report] Error:', error);
  }
}

/** Debug handler: manually trigger the report (for /debug/daily-report) */
export async function debugDailyReport(env: Env): Promise<{
  message: string;
  slackMessage?: string;
}> {
  const apiSecret = env.MIXPANEL_API_SECRET;
  if (!apiSecret) {
    return { message: 'MIXPANEL_API_SECRET not set' };
  }

  const yesterday = getKSTDateString(-1);
  const dayBefore = getKSTDateString(-2);

  const [todayEvents, prevEvents] = await Promise.all([
    fetchMixpanelEvents(apiSecret, yesterday, yesterday),
    fetchMixpanelEvents(apiSecret, dayBefore, dayBefore),
  ]);

  if (todayEvents.length === 0) {
    return { message: `No events for ${yesterday}` };
  }

  const metrics = aggregateMetrics(todayEvents, prevEvents);
  const slackMessage = formatSlackMessage(metrics, yesterday);

  const channel = env.DAILY_REPORT_CHANNEL;
  if (channel) {
    const slack = new SlackClient(env.SLACK_BOT_TOKEN);
    await slack.postMessage(channel, slackMessage);
  }

  return {
    message: `Report for ${yesterday}: ${metrics.uniqueUsers} users, ${metrics.issueCreated.count} issues`,
    slackMessage,
  };
}
