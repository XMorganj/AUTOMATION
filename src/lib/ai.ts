// src/lib/aiService.ts

async function callOllama(prompt: string, systemPrompt?: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'huihui_ai/dolphin3-abliterated:8b-llama3.1-q4_K_M';

  // Combine system prompt and user prompt for Ollama
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}` : prompt;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true' // Crucial: bypasses ngrok's web warning page for server-to-server calls
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
