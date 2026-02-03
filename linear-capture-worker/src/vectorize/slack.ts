import type { SlackVectorMetadata, VectorizeEnv } from './index.js';
import { indexVectors } from './embeddings.js';
import { getTokens, type TokenStorageEnv } from '../oauth/token-storage.js';

const SLACK_CONVERSATIONS_URL = 'https://slack.com/api/conversations.list';
const SLACK_HISTORY_URL = 'https://slack.com/api/conversations.history';
const SLACK_USERS_URL = 'https://slack.com/api/users.list';

interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
}

interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}

function resolveUserMentions(text: string, userMap: Map<string, string>): string {
  const mentions = text.match(/<@([A-Z0-9]+)>/g);
  if (mentions && mentions.length > 0) {
    console.log('[resolveUserMentions] Found mentions:', mentions, 'userMap size:', userMap.size);
  }
  return text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
    const displayName = userMap.get(userId);
    if (mentions && mentions.length > 0) {
      console.log('[resolveUserMentions] Resolving', userId, '->', displayName || 'NOT FOUND');
    }
    return displayName ? `@${displayName}` : match;
  });
}

async function fetchUserMap(accessToken: string): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();

  try {
    const response = await fetch(SLACK_USERS_URL, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const data = await response.json() as {
      ok: boolean;
      members?: SlackUser[];
      error?: string;
    };

    console.log('[fetchUserMap] API response ok:', data.ok, 'members count:', data.members?.length || 0, 'error:', data.error);

    if (data.ok && data.members) {
      for (const user of data.members) {
        const displayName =
          user.profile?.display_name ||
          user.profile?.real_name ||
          user.real_name ||
          user.name;
        userMap.set(user.id, displayName);
      }
      console.log('[fetchUserMap] Built userMap with', userMap.size, 'users');
    }
  } catch (error) {
    console.error('[fetchUserMap] Error:', error);
  }

  return userMap;
}

export async function handleSlackIndex(
  request: Request,
  env: SlackEnv & VectorizeEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const maxMessages = parseInt(url.searchParams.get('maxMessages') || '100', 10);

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
     const userMap = await fetchUserMap(tokens.access_token);

     const channelsResponse = await fetch(
       `${SLACK_CONVERSATIONS_URL}?types=public_channel&limit=50`,
       {
         headers: { 'Authorization': `Bearer ${tokens.access_token}` },
       }
     );

     const channelsData = await channelsResponse.json() as {
       ok: boolean;
       channels?: SlackChannel[];
       error?: string;
     };

     if (!channelsData.ok || !channelsData.channels) {
       return new Response(
         JSON.stringify({ success: false, error: channelsData.error || 'Failed to fetch channels' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     const memberChannels = channelsData.channels.filter(ch => ch.is_member);
     const records: Array<{ text: string; metadata: SlackVectorMetadata }> = [];
     const messagesPerChannel = Math.ceil(maxMessages / Math.max(memberChannels.length, 1));

    for (const channel of memberChannels.slice(0, 30)) {
      const historyResponse = await fetch(
        `${SLACK_HISTORY_URL}?channel=${channel.id}&limit=${messagesPerChannel}`,
        {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        }
      );

      const historyData = await historyResponse.json() as {
        ok: boolean;
        messages?: SlackMessage[];
      };

      if (!historyData.ok || !historyData.messages) continue;

       for (const msg of historyData.messages) {
         if (msg.type !== 'message' || !msg.text) continue;

         const resolvedText = resolveUserMentions(msg.text, userMap);
         const timestamp = parseFloat(msg.ts) * 1000;
         const permalink = `https://slack.com/archives/${channel.id}/p${msg.ts.replace('.', '')}`;

         records.push({
           text: resolvedText,
           metadata: {
             source: 'slack',
             deviceId,
             sourceId: `${channel.id}-${msg.ts}`,
             title: resolvedText.slice(0, 100),
             url: permalink,
             snippet: resolvedText.slice(0, 200),
             timestamp,
             channel: channel.name,
             user: msg.user || 'unknown',
             permalink,
           },
         });
       }
    }

    const result = await indexVectors(env, 'slack', records);

    return new Response(
      JSON.stringify({ success: true, indexed: result.indexed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack index error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
