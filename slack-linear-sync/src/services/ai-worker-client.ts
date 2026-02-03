export interface TextAnalysisRequest {
  messages: Array<{ author: string; text: string }>;
  context?: {
    projects: Array<{ id: string; name: string; description?: string }>;
    users: Array<{ id: string; name: string }>;
  };
  slackPermalink?: string;
}

export interface TextAnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedPriority?: number;
  error?: string;
}

export async function analyzeText(
  workerUrl: string,
  request: TextAnalysisRequest
): Promise<TextAnalysisResult> {
  const url = `${workerUrl}/analyze-text`;
  console.log('Fetching URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'slack-linear-sync/1.0',
      },
      body: JSON.stringify(request),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return {
        title: '',
        description: '',
        success: false,
        error: `Worker API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json() as TextAnalysisResult;
    console.log('Success result:', JSON.stringify(result).slice(0, 200));
    return result;
  } catch (err) {
    console.error('Fetch error:', err);
    return {
      title: '',
      description: '',
      success: false,
      error: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
