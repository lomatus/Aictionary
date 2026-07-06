//! Llama server HTTP inference client.

import { invoke } from "@tauri-apps/api/core";
import { LlmServiceError } from "./llm-service";

export class LlamaServiceError extends LlmServiceError {}

export interface LlamaServerStatus {
  running: boolean;
  port: number;
}

/** Start llama-server with the given parameters. Returns the actual port. */
export async function startLlamaServer(
  binaryPath: string,
  modelPath: string,
  nCtx = 4096,
  nGpuLayers = 99,
  hintPort = 11435,
): Promise<number> {
  return invoke<number>("start_llama_server", {
    binaryPath,
    modelPath,
    nCtx,
    nGpuLayers,
    hintPort,
  });
}

/** Stop the running llama-server. */
export async function stopLlamaServer(): Promise<void> {
  await invoke("stop_llama_server");
}

/** Check whether llama-server is running and on which port. */
export async function getLlamaServerStatus(): Promise<LlamaServerStatus> {
  return invoke<LlamaServerStatus>("get_llama_server_status");
}

/** Get the app's bundled resource directory path. */
export async function getResourceDir(): Promise<string> {
  return invoke<string>("get_resource_dir");
}

interface ChatCompletionMessage {
  role: "user";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  content?: string;
}

/**
 * Translate text via llama-server's OpenAI-compatible /v1/chat/completions endpoint.
 * If `prompt` is provided and non-empty, placeholders {source_text} and {target_lang}
 * are substituted and wrapped in a user message. Otherwise a default message is used.
 */
export async function translateTextWithLlama(
  text: string,
  targetLang: string,
  port: number,
  prompt?: string,
): Promise<{ sourceText: string; translatedText: string; targetLang: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new LlamaServiceError("Text is required.");
  }
  if (!port || port <= 0) {
    throw new LlamaServiceError(
      `Llama server port not configured (${port}). Start the llama server first.`
    );
  }

  let userContent: string;
  if (prompt && prompt.trim().length > 0) {
    userContent = prompt
      .replace("{source_text}", trimmed)
      .replace("{target_lang}", targetLang);
  } else {
    userContent = `Translate the following text into ${targetLang}. Only output the translation, no explanation.\n\n${trimmed}`;
  }

  console.log(`[llama] /v1/chat/completions body:\n${JSON.stringify({ messages: [{ role: "user", content: userContent }] }, null, 2)}\n---`);

  const url = `http://localhost:${port}/v1/chat/completions`;

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [{ role: "user", content: userContent } satisfies ChatCompletionMessage],
        temperature: 0.7,
        top_p: 0.6,
        top_k: 20,
        repeat_penalty: 1.05,
        max_tokens: 4096,
        stop: ["</s>"],
      }),
    });
    clearTimeout(timer);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlamaServiceError("Llama request timed out after 2 minutes.");
    }
    throw new LlamaServiceError(
      `Network error reaching llama-server at ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    let textBody = "(could not read response body)";
    try {
      textBody = await response.text();
    } catch { /* ignore */ }
    throw new LlamaServiceError(`Llama server ${response.status}: ${textBody}`);
  }

  let data: ChatCompletionResponse;
  try {
    data = await response.json() as ChatCompletionResponse;
  } catch {
    throw new LlamaServiceError("Llama server returned invalid JSON response.");
  }

  // Support both chat format (choices[].message.content) and legacy content field
  const content =
    data.choices?.[0]?.message?.content?.trim() ??
    data.content?.trim();

  if (!content) {
    throw new LlamaServiceError(
      `Llama returned empty content. Response: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  return {
    sourceText: trimmed,
    translatedText: content,
    targetLang,
  };
}
