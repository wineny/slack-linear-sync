interface EmbeddingRequest {
  texts: string[];
}

interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export async function handleEmbeddings(
  request: Request,
  env: { OPENAI_API_KEY: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = (await request.json()) as EmbeddingRequest;

    // Validate input
    if (!body.texts || !Array.isArray(body.texts)) {
      return new Response(
        JSON.stringify({ error: 'texts array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (body.texts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'texts array cannot be empty' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (body.texts.length > 100) {
      return new Response(
        JSON.stringify({ error: 'texts array cannot exceed 100 items' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: body.texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    // Map embeddings from response
    const embeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    const result: EmbeddingResponse = {
      embeddings,
      model: data.model,
      usage: data.usage,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Embeddings error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
