import { buildImagePrompt, buildTextPrompt } from './prompts/index.js';
import type { TextAnalysisRequest, TextAnalysisResult, PromptContext } from './prompts/index.js';
import { storeTokens, getTokens, deleteTokens, validateParams, type OAuthTokens, type TokenStorageEnv } from './oauth/token-storage.js';
import { handleSlackAuth, handleSlackCallback, handleSlackChannels, handleSlackStatus, handleSlackDisconnect, type SlackEnv } from './slack/oauth.js';
import { handleSlackSearch } from './slack/search.js';
import { handleSlackHistory } from './slack/history.js';
import { handleSlackUsers } from './slack/users.js';
import { handleNotionAuth, handleNotionCallback, handleNotionStatus, handleNotionDisconnect, type NotionEnv } from './notion/oauth.js';
import { handleNotionSearch } from './notion/search.js';
import { handleNotionBlocks } from './notion/blocks.js';
import { handleGmailAuth, handleGmailCallback, handleGmailStatus, handleGmailDisconnect, type GmailEnv } from './gmail/oauth.js';
import { handleGmailSearch } from './gmail/search.js';
import { handleGmailIndex } from './vectorize/gmail.js';
import { handleSlackIndex } from './vectorize/slack.js';
import { handleNotionIndex } from './vectorize/notion.js';
import { handleLinearIndex } from './vectorize/linear.js';
import { handleRecommend } from './vectorize/recommend.js';
import type { VectorizeEnv } from './vectorize/index.js';
import { handleTrack } from './analytics/track.js';
import { handleAnalyticsQuery, type AnalyticsQueryEnv } from './analytics/query.js';
import { handleSearch, type SearchEnv } from './search/stateless.js';
import { handleEmbeddings } from './embeddings-openai.js';

interface Env extends VectorizeEnv, AnalyticsQueryEnv, SearchEnv {
  GEMINI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
  OAUTH_TOKENS: KVNamespace;
  TOKEN_ENCRYPTION_KEY: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  NOTION_CLIENT_ID: string;
  NOTION_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

interface AnalysisRequest {
  images: Array<{
    data: string;
    mimeType: string;
  }>;
  context?: PromptContext;
  instruction?: string;
  language?: string;
  model?: 'gemini' | 'haiku';
}

interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedAssigneeId?: string;
  suggestedPriority?: number;
  suggestedEstimate?: number;
  error?: string;
}

interface UploadRequest {
  images: Array<{
    data: string;
    mimeType: string;
    fileName?: string;
  }>;
}

interface UploadResult {
  success: boolean;
  urls?: string[];
  error?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/oauth/token') {
        return await handleOAuthToken(request, env, corsHeaders);
      }

      if (path === '/slack/auth' && request.method === 'GET') {
        return handleSlackAuth(request, env as SlackEnv, corsHeaders);
      }

      if (path === '/slack/callback' && request.method === 'POST') {
        return await handleSlackCallback(request, env as SlackEnv, corsHeaders);
      }

      if (path === '/slack/channels' && request.method === 'GET') {
        return await handleSlackChannels(request, env as SlackEnv, corsHeaders);
      }

      if (path === '/slack/status' && request.method === 'GET') {
        return await handleSlackStatus(request, env as SlackEnv, corsHeaders);
      }

      if (path === '/slack/disconnect' && request.method === 'DELETE') {
        return await handleSlackDisconnect(request, env as SlackEnv, corsHeaders);
      }

       if (path === '/slack/search' && request.method === 'GET') {
         return await handleSlackSearch(request, env as SlackEnv, corsHeaders);
       }

       if (path === '/slack/history' && request.method === 'GET') {
         return await handleSlackHistory(request, env as SlackEnv, corsHeaders);
       }

       if (path === '/slack/users' && request.method === 'GET') {
         return await handleSlackUsers(request, env as SlackEnv, corsHeaders);
       }

       if (path === '/slack/oauth-redirect' && request.method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        const deepLinkUrl = new URL('linear-capture://slack/callback');
        if (code) deepLinkUrl.searchParams.set('code', code);
        if (state) deepLinkUrl.searchParams.set('state', state);
        if (error) deepLinkUrl.searchParams.set('error', error);

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Redirecting to Linear Capture...</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    a { color: #5e6ad2; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Slack 연결 완료!</h1>
    <p>Linear Capture 앱으로 돌아갑니다...</p>
    <p><a href="${deepLinkUrl.toString()}">자동으로 열리지 않으면 클릭하세요</a></p>
  </div>
  <script>
    window.location.href = "${deepLinkUrl.toString()}";
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (path === '/notion/auth' && request.method === 'GET') {
        return handleNotionAuth(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/callback' && request.method === 'POST') {
        return await handleNotionCallback(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/status' && request.method === 'GET') {
        return await handleNotionStatus(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/disconnect' && request.method === 'DELETE') {
        return await handleNotionDisconnect(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/search' && request.method === 'GET') {
        return await handleNotionSearch(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/blocks' && request.method === 'GET') {
        return await handleNotionBlocks(request, env as NotionEnv, corsHeaders);
      }

      if (path === '/notion/oauth-redirect' && request.method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        const deepLinkUrl = new URL('linear-capture://notion/callback');
        if (code) deepLinkUrl.searchParams.set('code', code);
        if (state) deepLinkUrl.searchParams.set('state', state);
        if (error) deepLinkUrl.searchParams.set('error', error);

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Redirecting to Linear Capture...</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    a { color: #5e6ad2; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Notion 연결 완료!</h1>
    <p>Linear Capture 앱으로 돌아갑니다...</p>
    <p><a href="${deepLinkUrl.toString()}">자동으로 열리지 않으면 클릭하세요</a></p>
  </div>
  <script>
    window.location.href = "${deepLinkUrl.toString()}";
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (path === '/gmail/auth' && request.method === 'GET') {
        return handleGmailAuth(request, env as GmailEnv, corsHeaders);
      }

      if (path === '/gmail/callback' && request.method === 'POST') {
        return await handleGmailCallback(request, env as GmailEnv, corsHeaders);
      }

      if (path === '/gmail/status' && request.method === 'GET') {
        return await handleGmailStatus(request, env as GmailEnv, corsHeaders);
      }

      if (path === '/gmail/disconnect' && request.method === 'DELETE') {
        return await handleGmailDisconnect(request, env as GmailEnv, corsHeaders);
      }

      if (path === '/gmail/search' && request.method === 'GET') {
        return await handleGmailSearch(request, env as GmailEnv, corsHeaders);
      }

      if (path === '/gmail/oauth-redirect' && request.method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        const deepLinkUrl = new URL('linear-capture://gmail/callback');
        if (code) deepLinkUrl.searchParams.set('code', code);
        if (state) deepLinkUrl.searchParams.set('state', state);
        if (error) deepLinkUrl.searchParams.set('error', error);

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Redirecting to Linear Capture...</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    a { color: #5e6ad2; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Gmail 연결 완료!</h1>
    <p>Linear Capture 앱으로 돌아갑니다...</p>
    <p><a href="${deepLinkUrl.toString()}">자동으로 열리지 않으면 클릭하세요</a></p>
  </div>
  <script>
    window.location.href = "${deepLinkUrl.toString()}";
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (path === '/index/gmail' && request.method === 'POST') {
        return await handleGmailIndex(request, env as GmailEnv & VectorizeEnv, corsHeaders);
      }

      if (path === '/index/slack' && request.method === 'POST') {
        return await handleSlackIndex(request, env as SlackEnv & VectorizeEnv, corsHeaders);
      }

      if (path === '/index/notion' && request.method === 'POST') {
        return await handleNotionIndex(request, env as NotionEnv & VectorizeEnv, corsHeaders);
      }

      if (path === '/index/linear' && request.method === 'POST') {
        return await handleLinearIndex(request, env, corsHeaders);
      }

      if (path === '/ai/recommend' && request.method === 'POST') {
        return await handleRecommend(request, env, corsHeaders);
      }

      if (path === '/search' && request.method === 'POST') {
        return await handleSearch(request, env, corsHeaders);
      }

      if (path === '/analytics' && request.method === 'GET') {
        return await handleAnalyticsQuery(request, env, corsHeaders);
      }

       if (path === '/track' && request.method === 'POST') {
         return await handleTrack(request, env, corsHeaders);
       }

       if (path === '/embeddings' && request.method === 'POST') {
         return await handleEmbeddings(request, env, corsHeaders);
       }

      // Static assets serving (public, no auth) - for landing page demo video etc.
      if (path.startsWith('/assets/') && request.method === 'GET') {
        const r2Key = path.slice(1); // "assets/demo.mp4" etc.
        const object = await env.R2_BUCKET.get(r2Key);
        if (!object) {
          return new Response(`Not found: ${r2Key}`, { status: 404, headers: corsHeaders });
        }
        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Content-Length', object.size.toString());
        headers.set('Cache-Control', 'public, max-age=86400');
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(object.body, { headers });
      }

      // Release latest-info API (public) - returns version JSON from latest-mac.yml
      if (path === '/releases/latest-info' && request.method === 'GET') {
        const ymlObj = await env.R2_BUCKET.get('releases/latest-mac.yml');
        if (!ymlObj) {
          return new Response(JSON.stringify({ error: 'latest-mac.yml not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const yml = await ymlObj.text();
        const version = yml.match(/^version:\s*(.+)$/m)?.[1]?.trim() || '';
        const releaseDate = yml.match(/^releaseDate:\s*'?(.+?)'?$/m)?.[1]?.trim() || '';
        const dmgFile = yml.match(/- url:\s*(.+\.dmg)$/m)?.[1]?.trim() || '';
        const workerBase = new URL(request.url).origin;
        return new Response(JSON.stringify({
          version,
          dmgUrl: dmgFile ? `${workerBase}/releases/${dmgFile}` : '',
          releaseDate,
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      }

      // Release download redirect (public) - redirects to latest DMG
      if (path === '/releases/download/latest' && request.method === 'GET') {
        const ymlObj = await env.R2_BUCKET.get('releases/latest-mac.yml');
        if (!ymlObj) {
          return new Response('latest-mac.yml not found', { status: 404, headers: corsHeaders });
        }
        const yml = await ymlObj.text();
        const dmgFile = yml.match(/- url:\s*(.+\.dmg)$/m)?.[1]?.trim();
        if (!dmgFile) {
          return new Response('DMG file not found in yml', { status: 404, headers: corsHeaders });
        }
        const workerBase = new URL(request.url).origin;
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            'Location': `${workerBase}/releases/${dmgFile}`,
            'Cache-Control': 'no-cache',
          },
        });
      }

      // Release file serving (public, no auth) - for electron-updater generic provider
      if (path.startsWith('/releases/') && request.method === 'GET') {
        const r2Key = path.slice(1); // "releases/latest-mac.yml" etc.
        const object = await env.R2_BUCKET.get(r2Key);
        if (!object) {
          return new Response(`Not found: ${r2Key}`, { status: 404, headers: corsHeaders });
        }
        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Content-Length', object.size.toString());
        headers.set('Cache-Control', path.endsWith('.yml') ? 'public, max-age=60' : 'public, max-age=3600');
        return new Response(object.body, { headers });
      }

       if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (path === '/upload') {
        const body: UploadRequest = await request.json();
        const result = await uploadToR2(body, env);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (path === '/summarize-context' && request.method === 'POST') {
        const body = await request.json() as {
          items: Array<{ source: string; title: string; snippet: string; url?: string; timestamp?: string }>;
          language?: string;
        };
        if (!body.items || body.items.length === 0) {
          return new Response(JSON.stringify({ error: 'No items provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const result = await summarizeContext(body.items, body.language || 'en', env.ANTHROPIC_API_KEY);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (path === '/analyze-text') {
        const body: TextAnalysisRequest = await request.json();
        if (!body.messages || body.messages.length === 0) {
          return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const result = await analyzeText(body, env.ANTHROPIC_API_KEY);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body: AnalysisRequest = await request.json();

      if (!body.images || body.images.length === 0) {
        return new Response(JSON.stringify({ error: 'No images provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let result: AnalysisResult;

      if (body.model === 'haiku') {
        result = await analyzeWithHaiku(body, env.ANTHROPIC_API_KEY);
      } else {
        result = await analyzeWithGemini(body, env.GEMINI_API_KEY);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};

async function summarizeContext(
  items: Array<{ source: string; title: string; snippet: string; url?: string; timestamp?: string }>,
  language: string,
  apiKey: string
): Promise<{ success: boolean; markdown: string; error?: string }> {
  const itemsText = items.map((item, i) => {
    const parts = [`[${i + 1}] Source: ${item.source}, Title: ${item.title}`];
    if (item.timestamp) parts.push(`Date: ${item.timestamp}`);
    if (item.snippet) parts.push(`Content: ${item.snippet}`);
    if (item.url) parts.push(`URL: ${item.url}`);
    return parts.join('\n');
  }).join('\n\n');

  const langInstruction = language === 'ko'
    ? '한국어로 작성하세요.'
    : language === 'en' ? 'Write in English.' : `Write in ${language}.`;

  const prompt = `You are summarizing related context items to be appended to a Linear issue description.

${langInstruction}

Group items by source and summarize each into 2-5 bullet points. Use this exact markdown format:

## Related Context

### Slack ([#channel-name](url))
- Key insight from this Slack thread
- Another key point

### Notion ([Page Title](url))
- Key insight from this Notion page

Rules:
- Group by source type (Slack, Notion, Gmail, Linear)
- Each source section: ### heading with source name and ONE representative link
- Under each heading: 2-5 bullet points summarizing the key insights from that source
- Each bullet: 1 concise sentence (max 100 chars) capturing actionable info
- If a source has multiple items, combine them under one heading
- If an item has no URL, omit the link: ### Slack
- Focus on actionable information, decisions, and key facts
- Do NOT include dates or metadata in bullets

Items to summarize:
${itemsText}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, markdown: '', error: `API error: ${response.status}` };
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const markdown = data.content?.[0]?.type === 'text' ? data.content[0].text || '' : '';

  return { success: true, markdown: markdown.trim() };
}

async function uploadToR2(request: UploadRequest, env: Env): Promise<UploadResult> {
  if (!request.images || request.images.length === 0) {
    return { success: false, error: 'No images provided' };
  }

  const urls: string[] = [];
  const publicUrl = env.R2_PUBLIC_URL.replace(/\/$/, '');

  for (let i = 0; i < request.images.length; i++) {
    const img = request.images[i];
    const timestamp = Date.now();
    const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
    const fileName = img.fileName || `capture-${i}.${ext}`;
    const key = `captures/${timestamp}-${fileName}`;

    const binaryString = atob(img.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let j = 0; j < binaryString.length; j++) {
      bytes[j] = binaryString.charCodeAt(j);
    }

    await env.R2_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType: img.mimeType,
      },
    });

    urls.push(`${publicUrl}/${key}`);
  }

  return { success: true, urls };
}

async function analyzeText(
  request: TextAnalysisRequest,
  apiKey: string
): Promise<TextAnalysisResult> {
  const prompt = buildTextPrompt(request.messages, request.slackPermalink, request.context);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text || '' : '';

  return parseTextAnalysisResponse(text);
}

function extractJson(text: string): Record<string, unknown> | null {
  // Step 1: Strip code block markers and try direct parse
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Step 2: Extract first `{` to last `}` and try parse
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch { /* continue */ }
  }

  return null;
}

function parseTextAnalysisResponse(text: string): TextAnalysisResult {
  const json = extractJson(text);
  if (json) {
    return {
      title: (json.title as string) || '',
      description: (json.description as string) || '',
      success: true,
      suggestedProjectId: (json.projectId as string) || undefined,
      suggestedPriority: (json.priority as number) || undefined,
    };
  }
  return {
    title: '',
    description: text,
    success: false,
    error: 'Failed to parse JSON response',
  };
}

async function analyzeWithGemini(
  request: AnalysisRequest,
  apiKey: string
): Promise<AnalysisResult> {
  const { images, context, instruction, language } = request;

  const contextWithInstruction = context ? { ...context, instruction, language } : { instruction, language };
  const prompt = buildImagePrompt(images.length, contextWithInstruction);

  const imageParts = images.map((img) => ({
    inline_data: {
      mime_type: img.mimeType,
      data: img.data,
    },
  }));

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseJsonResponse(text, instruction);
}

async function analyzeWithHaiku(
  request: AnalysisRequest,
  apiKey: string
): Promise<AnalysisResult> {
  const { images, context, instruction, language } = request;

  const contextWithInstruction = context ? { ...context, instruction, language } : { instruction, language };
  const prompt = buildImagePrompt(images.length, contextWithInstruction);

  const imageContent = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      data: img.data,
    },
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text || '' : '';

  return parseJsonResponse(text, instruction);
}

function validateTitle(title: string, instruction?: string): string {
  if (!instruction || !title) return title;
  const t = title.trim().toLowerCase();
  const i = instruction.trim().toLowerCase();
  // Identical or containment → clear title
  if (t === i || t.startsWith(i) || i.startsWith(t)) return '';
  // Word similarity > 80% → clear title
  const tWords = new Set(t.split(/\s+/));
  const iWords = new Set(i.split(/\s+/));
  const overlap = [...tWords].filter(w => iWords.has(w)).length;
  const similarity = (2 * overlap) / (tWords.size + iWords.size);
  if (similarity > 0.8) return '';
  return title;
}

function parseJsonResponse(text: string, instruction?: string): AnalysisResult {
  const json = extractJson(text);
  if (json) {
    return {
      title: validateTitle((json.title as string) || '', instruction),
      description: (json.description as string) || '',
      success: true,
      suggestedProjectId: (json.projectId as string) || undefined,
      suggestedAssigneeId: (json.assigneeId as string) || undefined,
      suggestedPriority: (json.priority as number) || undefined,
      suggestedEstimate: (json.estimate as number) || undefined,
    };
  }
  return {
    title: '',
    description: text,
    success: false,
    error: 'Failed to parse JSON response',
  };
}

async function handleOAuthToken(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const tokenEnv: TokenStorageEnv = {
    OAUTH_TOKENS: env.OAUTH_TOKENS,
    TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY,
  };

  if (request.method === 'POST') {
    const body = await request.json() as { device_id?: string; service?: string; tokens?: OAuthTokens };
    const validation = validateParams(body.device_id, body.service);
    
    if (!validation.valid) {
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.tokens || typeof body.tokens !== 'object' || !body.tokens.access_token) {
      return new Response(JSON.stringify({ success: false, error: 'tokens with access_token required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await storeTokens(tokenEnv, body.device_id!, body.service!, body.tokens);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'GET') {
    const deviceId = url.searchParams.get('device_id');
    const service = url.searchParams.get('service');
    const validation = validateParams(deviceId, service);

    if (!validation.valid) {
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokens = await getTokens(tokenEnv, deviceId!, service!);
    if (!tokens) {
      return new Response(JSON.stringify({ success: false, error: 'Tokens not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, tokens }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'DELETE') {
    const deviceId = url.searchParams.get('device_id');
    const service = url.searchParams.get('service');
    const validation = validateParams(deviceId, service);

    if (!validation.valid) {
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await deleteTokens(tokenEnv, deviceId!, service!);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
