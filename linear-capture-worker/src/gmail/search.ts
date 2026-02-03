import { deleteTokens, type TokenStorageEnv } from '../oauth/token-storage.js';
import { getValidGmailToken } from './oauth.js';

const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

export interface GmailEnv extends TokenStorageEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: {
    name: string;
    email: string;
  };
  date: string;
  snippet: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: { code: number; message: string; status: string };
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  error?: { code: number; message: string; status: string };
}

function parseFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: (match[1] || '').trim() || match[2],
      email: match[2].trim(),
    };
  }
  return { name: from, email: from };
}

export async function handleGmailSearch(
  request: Request,
  env: GmailEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const query = url.searchParams.get('query');
  const maxResults = url.searchParams.get('maxResults') || '10';

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!query) {
    return new Response(
      JSON.stringify({ success: false, error: 'query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokenResult = await getValidGmailToken(env, deviceId);
  if ('error' in tokenResult) {
    return new Response(
      JSON.stringify({ success: false, error: tokenResult.error }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const listParams = new URLSearchParams({
      q: query,
      maxResults,
    });

    const listResponse = await fetch(
      `${GMAIL_MESSAGES_URL}?${listParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenResult.token}`,
        },
      }
    );

    if (!listResponse.ok) {
      const errorData = await listResponse.json() as { error?: { code: number; message: string; status: string } };
      console.error('Gmail list failed:', errorData);

      if (listResponse.status === 401 || errorData.error?.code === 401) {
        await deleteTokens(env, deviceId, 'gmail');
        return new Response(
          JSON.stringify({ success: false, error: 'Gmail token revoked. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.error?.message || 'Failed to search messages',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const listData: GmailListResponse = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          messages: [],
          total: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages: GmailMessage[] = [];

    for (const msg of listData.messages) {
      const getParams = new URLSearchParams({
        format: 'metadata',
        metadataHeaders: 'Subject',
      });
      getParams.append('metadataHeaders', 'From');
      getParams.append('metadataHeaders', 'Date');

      const msgResponse = await fetch(
        `${GMAIL_MESSAGES_URL}/${msg.id}?${getParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokenResult.token}`,
          },
        }
      );

      if (!msgResponse.ok) {
        continue;
      }

      const msgData: GmailMessageResponse = await msgResponse.json();
      const headers = msgData.payload?.headers || [];

      const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
      const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');

      messages.push({
        id: msgData.id,
        threadId: msgData.threadId,
        subject: subjectHeader?.value || '(No Subject)',
        from: parseFromHeader(fromHeader?.value || ''),
        date: dateHeader?.value || '',
        snippet: msgData.snippet || '',
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        messages,
        total: listData.resultSizeEstimate || messages.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Gmail search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
