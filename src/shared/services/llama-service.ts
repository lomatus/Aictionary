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

interface CompletionResponse {
  content?: string;
  stop?: boolean;
}

/** Translate text via llama-server's /completion endpoint. */
export async function translateTextWithLlama(
  text: string,
  targetLang: string,
  port: number,
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

  const url = `http://localhost:${port}/completion`;

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: `You are a professional translator. Translate into ${targetLang}. Only output the translation, no explanation.\n\n${trimmed}`,
        n_predict: 512,
        temperature: 0.3,
        stop: ["</s>", "\n\n\n"],
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

  let data: CompletionResponse;
  try {
    data = await response.json() as CompletionResponse;
  } catch {
    throw new LlamaServiceError("Llama server returned invalid JSON response.");
  }

  const content = data.content?.trim();
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
