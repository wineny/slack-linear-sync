import { buildImagePrompt, buildTextPrompt } from './prompts/index.js';
import type { TextAnalysisRequest, TextAnalysisResult, PromptContext } from './prompts/index.js';

interface Env {
  GEMINI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

interface AnalysisRequest {
  images: Array<{
    data: string;
    mimeType: string;
  }>;
  context?: PromptContext;
  instruction?: string;
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/upload') {
        const body: UploadRequest = await request.json();
        const result = await uploadToR2(body, env);
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

function parseTextAnalysisResponse(text: string): TextAnalysisResult {
  const cleanedText = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const json = JSON.parse(cleanedText);
    return {
      title: json.title || '',
      description: json.description || '',
      success: true,
      suggestedProjectId: json.projectId || undefined,
      suggestedPriority: json.priority || undefined,
    };
  } catch {
    return {
      title: '',
      description: text,
      success: false,
      error: 'Failed to parse JSON response',
    };
  }
}

async function analyzeWithGemini(
  request: AnalysisRequest,
  apiKey: string
): Promise<AnalysisResult> {
  const { images, context } = request;

  const prompt = buildImagePrompt(images.length, context);

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

  return parseJsonResponse(text);
}

async function analyzeWithHaiku(
  request: AnalysisRequest,
  apiKey: string
): Promise<AnalysisResult> {
  const { images, context } = request;

  const prompt = buildImagePrompt(images.length, context);

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

  return parseJsonResponse(text);
}

function parseJsonResponse(text: string): AnalysisResult {
  const cleanedText = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const json = JSON.parse(cleanedText);
    return {
      title: json.title || '',
      description: json.description || '',
      success: true,
      suggestedProjectId: json.projectId || undefined,
      suggestedAssigneeId: json.assigneeId || undefined,
      suggestedPriority: json.priority || undefined,
      suggestedEstimate: json.estimate || undefined,
    };
  } catch {
    return {
      title: '',
      description: text,
      success: false,
      error: 'Failed to parse JSON response',
    };
  }
}
