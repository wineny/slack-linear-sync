import type { GmailVectorMetadata, VectorizeEnv } from './index.js';
import { indexVectors } from './embeddings.js';
import { getValidGmailToken, type GmailEnv } from '../gmail/oauth.js';

const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

interface GmailListResponse {
  messages?: Array<GmailMessageResponse>;
  nextPageToken?: string;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
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

export async function handleGmailIndex(
  request: Request,
  env: GmailEnv & VectorizeEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const maxResults = parseInt(url.searchParams.get('maxResults') || '100', 10);

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
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
       maxResults: String(Math.min(maxResults, 100)),
       fields: 'messages(id,threadId,snippet,internalDate,payload/headers)',
     });

     const listResponse = await fetch(
       `${GMAIL_MESSAGES_URL}?${listParams.toString()}`,
       {
         headers: { 'Authorization': `Bearer ${tokenResult.token}` },
       }
     );

     if (!listResponse.ok) {
       return new Response(
         JSON.stringify({ success: false, error: 'Failed to fetch messages' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     const listData: GmailListResponse = await listResponse.json();
     if (!listData.messages || listData.messages.length === 0) {
       return new Response(
         JSON.stringify({ success: true, indexed: 0 }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     const records: Array<{ text: string; metadata: GmailVectorMetadata }> = [];

     for (const msgData of listData.messages) {
       const headers = msgData.payload?.headers || [];

       const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
       const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');

       const subject = subjectHeader?.value || '(No Subject)';
       const from = parseFromHeader(fromHeader?.value || '');
       const text = `${subject} ${msgData.snippet}`;

       records.push({
         text,
         metadata: {
           source: 'gmail',
           deviceId,
           sourceId: msgData.id,
           title: subject,
           url: `https://mail.google.com/mail/u/0/#inbox/${msgData.threadId}`,
           snippet: msgData.snippet || '',
           timestamp: parseInt(msgData.internalDate, 10),
           from: from.email,
           threadId: msgData.threadId,
         },
       });
     }

    const result = await indexVectors(env, 'gmail', records);

    return new Response(
      JSON.stringify({ success: true, indexed: result.indexed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Gmail index error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
