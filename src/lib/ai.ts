// src/lib/ai.ts

interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  provider?: 'anthropic' | 'ollama';
}

/**
 * Checks if the required API key or configuration exists for the active provider.
 */
export function hasKey(provider?: string): boolean {
  const activeProvider = provider || process.env.DEFAULT_AI_PROVIDER || 'ollama';
  if (activeProvider === 'anthropic') {
    return !!process.env.ANTHROPIC_API_KEY;
  }
  return !!process.env.OLLAMA_BASE_URL || true;
}

/**
 * Extracts and parses JSON from raw AI text responses (handles markdown blocks or raw strings).
 */
export function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Look for markdown json code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (err) {
        // continue
      }
    }
    // Fallback: find first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (err) {
        // continue
      }
    }
    throw new Error('Failed to extract valid JSON from AI response');
  }
}

export async function generateAIContent({ prompt, systemPrompt, provider }: GenerateOptions): Promise<string> {
  const activeProvider = provider || process.env.DEFAULT_AI_PROVIDER || 'ollama';

  if (activeProvider === 'anthropic') {
    return await callAnthropic(prompt, systemPrompt);
  } else {
    return await callOllama(prompt, systemPrompt);
  }
}

// 1. Anthropic Handler
async function callAnthropic(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('Anthropic API key is missing. Please set ANTHROPIC_API_KEY or switch provider to ollama.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemPrompt || 'You are an expert YouTube scriptwriter specializing in dark history and mystery content.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API error: ${errorData}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// 2. Ollama Local Handler (via Ngrok)
async function callOllama(prompt: string, systemPrompt?: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'huihui_ai/dolphin3-abliterated:8b-llama3.1-q4_K_M';

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}` : prompt;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true' // Bypasses ngrok's interstitial warning page
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: fullPrompt }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to connect to local Ollama via ngrok: ${errorText}`);
  }

  const data = await response.json();
  return data.message.content;
}
