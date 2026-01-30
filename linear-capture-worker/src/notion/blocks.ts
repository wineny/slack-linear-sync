/**
 * Notion Blocks Module - GET /v1/blocks/{page_id}/children API integration
 * Extracts text content from Notion page blocks
 */

import { getValidNotionToken, type NotionEnv } from './oauth.js';

const NOTION_API_VERSION = '2022-06-28';
const MAX_CONTENT_LENGTH = 2000;
const MAX_DEPTH = 3;
const MAX_API_CALLS = 40;

const TEXT_BLOCK_TYPES = [
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'code',
  'toggle',
] as const;

type TextBlockType = typeof TEXT_BLOCK_TYPES[number];

interface RichText {
  plain_text: string;
}

interface BlockContent {
  rich_text?: RichText[];
  checked?: boolean;
  language?: string;
}

interface NotionBlock {
  object: 'block';
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface NotionBlocksResponse {
  object: 'list';
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionErrorResponse {
  object: 'error';
  code: string;
  message: string;
}

interface FetchBlocksResult {
  blocks: NotionBlock[];
  error?: { status: number; data: NotionErrorResponse };
}

interface FetchContext {
  token: string;
  apiCalls: number;
  visitedIds: Set<string>;
  budgetExhausted: boolean;
}

async function fetchBlocksPaginated(
  blockId: string,
  ctx: FetchContext
): Promise<FetchBlocksResult> {
  const allBlocks: NotionBlock[] = [];
  let cursor: string | null = null;

  do {
    if (ctx.apiCalls >= MAX_API_CALLS) {
      ctx.budgetExhausted = true;
      break;
    }

    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) {
      url.searchParams.set('start_cursor', cursor);
    }

    ctx.apiCalls++;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ctx.token}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });

    if (!response.ok) {
      const errorData: NotionErrorResponse = await response.json();
      return { blocks: allBlocks, error: { status: response.status, data: errorData } };
    }

    const data: NotionBlocksResponse = await response.json();
    allBlocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return { blocks: allBlocks };
}

interface BlockWithChildren {
  block: NotionBlock;
  children: BlockWithChildren[];
}

async function fetchBlocksRecursively(
  blockId: string,
  ctx: FetchContext,
  depth: number = 0
): Promise<{ tree: BlockWithChildren[]; error?: FetchBlocksResult['error'] }> {
  if (depth > MAX_DEPTH || ctx.budgetExhausted) {
    return { tree: [] };
  }

  if (ctx.visitedIds.has(blockId)) {
    return { tree: [] };
  }
  ctx.visitedIds.add(blockId);

  const result = await fetchBlocksPaginated(blockId, ctx);
  if (result.error) {
    return { tree: [], error: result.error };
  }

  const tree: BlockWithChildren[] = [];

  for (const block of result.blocks) {
    const node: BlockWithChildren = { block, children: [] };

    if (block.has_children && !ctx.budgetExhausted) {
      const childResult = await fetchBlocksRecursively(block.id, ctx, depth + 1);
      if (childResult.error) {
        return { tree, error: childResult.error };
      }
      node.children = childResult.tree;
    }

    tree.push(node);
  }

  return { tree };
}

function flattenBlockTree(tree: BlockWithChildren[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  for (const node of tree) {
    blocks.push(node.block);
    if (node.children.length > 0) {
      blocks.push(...flattenBlockTree(node.children));
    }
  }
  return blocks;
}

function extractBlockText(block: NotionBlock): string {
  const blockType = block.type as TextBlockType;
  
  if (!TEXT_BLOCK_TYPES.includes(blockType)) {
    return '';
  }

  const content = block[blockType] as BlockContent | undefined;
  if (!content || !content.rich_text) {
    return '';
  }

  const text = content.rich_text.map(rt => rt.plain_text).join('');
  
  switch (blockType) {
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `• ${text}`;
    case 'numbered_list_item':
      return `- ${text}`;
    case 'to_do':
      const checked = content.checked ? '☑' : '☐';
      return `${checked} ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'callout':
      return `💡 ${text}`;
    case 'code':
      const lang = content.language || '';
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    case 'toggle':
      return `▸ ${text}`;
    default:
      return text;
  }
}

export async function handleNotionBlocks(
  request: Request,
  env: NotionEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');
  const pageId = url.searchParams.get('page_id');

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!pageId) {
    return new Response(
      JSON.stringify({ success: false, error: 'page_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokenResult = await getValidNotionToken(env, deviceId);
  if ('error' in tokenResult) {
    return new Response(
      JSON.stringify({ success: false, error: tokenResult.error }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const ctx: FetchContext = {
      token: tokenResult.token,
      apiCalls: 0,
      visitedIds: new Set<string>(),
      budgetExhausted: false,
    };

    const result = await fetchBlocksRecursively(pageId, ctx);

    if (result.error) {
      const { status, data: errorData } = result.error;
      console.error('Notion blocks fetch failed:', errorData);

      if (errorData.code === 'unauthorized' || errorData.code === 'invalid_token') {
        return new Response(
          JSON.stringify({ success: false, error: 'Notion token invalid. Please reconnect.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (errorData.code === 'object_not_found') {
        return new Response(
          JSON.stringify({ success: false, error: 'Page not found or not accessible' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Failed to fetch page content',
        }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allBlocks = flattenBlockTree(result.tree);
    const textParts: string[] = [];
    let blockCount = 0;

    for (const block of allBlocks) {
      const text = extractBlockText(block);
      if (text) {
        textParts.push(text);
        blockCount++;
      }
    }

    let content = textParts.join('\n\n');
    let truncated = ctx.budgetExhausted;

    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.substring(0, MAX_CONTENT_LENGTH) + '...';
      truncated = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        pageId,
        content,
        blockCount,
        truncated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Notion blocks error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
