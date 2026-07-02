import { join } from "@tauri-apps/api/path";
import { appDataDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LocalLlmSettings } from "@/shared/types/settings";
import { WordDefinition } from "@/shared/types/dictionary";
import { LlmServiceError } from "./llm-service";

export type LlamaDownloadStatus = {
  type: "llama-cpp" | "model";
  progress: number;
  total: number;
  downloaded: number;
};

const SYSTEM_PROMPT = `你是一位严谨的双语词典编纂专家。你的任务是为一个给定的英语单词及其近义词生成一份详细的中文解释，并以严格的 JSON 格式输出。

当 JSON 值中需要出现引号时，请使用中文双引号（" "），不要使用英文双引号。确保 JSON 中的所有字段都有完整的取值，不要遗漏或留空任何内容。

请精确遵循下面范例中提供的结构和内容深度。

---
### 范例 1:

**用户输入:**
example

**模型输出:**
{
  "word": "example",
  "pronunciation": "uhg·zam·pl",
  "concise_definition": "n. 例子, 范例, 榜样",
  "forms": {
    "plural": "examples"
  },
  "definitions": [
    {
      "pos": "noun",
      "explanation_en": "A specific case or instance used to clarify a general rule, principle, or idea, aiming to help explain, clarify, or support a point.",
      "explanation_cn": "指用以说明一般性规则、原则或想法的一个具体事例或个案，旨在帮助解释、澄清或支持一个观点。",
      "example_en": "This is a classic example of how marketing can influence consumer behavior.",
      "example_cn": "这是一个关于市场营销如何影响消费者行为的经典范例。"
    },
    {
      "pos": "noun",
      "explanation_en": "A model or standard for imitation, which can be positive (a role model) or negative (a cautionary tale).",
      "explanation_cn": "指一个可供他人模仿的榜样或典范，也可以指应引以为戒的反面教材。",
      "example_en": "Her dedication to the community sets a fine example for all of us.",
      "example_cn": "她对社区的奉献为我们所有人树立了一个好榜样。"
    }
  ],
  "comparison": [
    {
      "word_to_compare": "sample",
      "analysis": ""Sample" (样本) 侧重于从一个整体中取出的一小部分，用以展示整体的质量、风格或特性。它强调"代表性"。例如，布料的样品、产品的试用装。而 "example" 是为了"说明"一个概念或规则，不一定来自一个更大的实体。"
    },
    {
      "word_to_compare": "illustration",
      "analysis": ""Illustration" (图解/例证) 强调"视觉化"或"形象化"地解释说明。它可以是一个图片、图表，也可以是一个生动的故事，目的是让抽象的概念变得具体易懂。它的解释功能比 "example" 更强、更形象。"
    },
    {
      "word_to_compare": "instance",
      "analysis": ""Instance" (实例) 与 "example" 非常接近，常可互换，但 "instance" 更侧重于指一个具体"事件"或"情况"的发生，作为某个现象存在的证据。它比 "example" 更具客观性和事实性，常用于比较正式的论述中。"
    }
  ]
}

---

### TASK

现在，请严格按照上面的范例，为用户输入的单词生成 JSON 输出。不要在 JSON 对象之外添加任何额外的说明或文字。`;

export class LlamaServiceError extends LlmServiceError {}

export async function getLlamaCppDir(): Promise<string> {
  const dataDir = await appDataDir();
  return join(dataDir, "llama.cpp");
}

export async function getDefaultModelDir(): Promise<string> {
  const dataDir = await appDataDir();
  return join(dataDir, "models");
}

export async function downloadLlamaCpp(
  onProgress?: (status: LlamaDownloadStatus) => void
): Promise<string> {
  const isWindows = navigator.userAgent.includes("Windows");
  const version = "b4624";
  const triplet = isWindows ? "x64-windows" : "x64-linux";
  const archiveExt = isWindows ? "zip" : "tar.gz";
  const baseUrl = `https://github.com/ggml-org/llama.cpp/releases/download/b${version}/llama-b${version}-${triplet}.${archiveExt}`;
  const destDir = await getLlamaCppDir();
  const binaryName = isWindows ? "llama-server.exe" : "llama-server";

  const unlistenProgress = await listen<{ downloaded: number; total: number; percentage: number }>(
    "download-progress",
    (event) => {
      onProgress?.({
        type: "llama-cpp",
        progress: event.payload.percentage,
        total: event.payload.total,
        downloaded: event.payload.downloaded,
      });
    }
  );

  try {
    await invoke<string>("download_and_extract", { url: baseUrl, destDir });
    return join(destDir, "bin", binaryName);
  } finally {
    unlistenProgress();
  }
}

export async function downloadModel(
  url: string,
  destPath: string,
  onProgress?: (status: LlamaDownloadStatus) => void
): Promise<string> {
  const unlistenProgress = await listen<{ downloaded: number; total: number; percentage: number }>(
    "download-progress",
    (event) => {
      onProgress?.({
        type: "model",
        progress: event.payload.percentage,
        total: event.payload.total,
        downloaded: event.payload.downloaded,
      });
    }
  );

  try {
    await invoke<string>("download_file", { url, filePath: destPath });
    return destPath;
  } finally {
    unlistenProgress();
  }
}

export async function isLlamaServerRunning(port = 8080): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function startLlamaServer(
  binaryPath: string,
  modelPath: string,
  options: { nCtx: number; nGpu: number; port?: number } = {
    nCtx: 4096,
    nGpu: 0,
    port: 8080,
  }
): Promise<void> {
  const { nCtx, nGpu, port } = options;

  await invoke("spawn_llama_server", {
    binaryPath,
    modelPath,
    nCtx,
    nGpu,
    port,
  });
}

export async function stopLlamaServer(): Promise<void> {
  await invoke("stop_llama_server");
}

export async function generateDefinitionFromLlama(
  word: string,
  baseUrl: string = "http://localhost:8080"
): Promise<WordDefinition> {
  const trimmed = word.trim();
  if (!trimmed) {
    throw new LlamaServiceError("Word is required.");
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new LlamaServiceError(`Llama server error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlamaServiceError("Empty response from llama server.");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new LlamaServiceError("No JSON found in llama response.");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    word: parsed.word || trimmed,
    pronunciation: parsed.pronunciation || trimmed,
    concise_definition: parsed.concise_definition || "",
    forms: parsed.forms || {},
    definitions: parsed.definitions || [],
    comparison: parsed.comparison || [],
  };
}

export async function translateTextWithLlama(
  text: string,
  targetLang: string,
  baseUrl: string = "http://localhost:8080"
): Promise<{ sourceText: string; translatedText: string; targetLang: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new LlamaServiceError("Text is required.");
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a professional translator. Translate user input accurately and fluently.",
        },
        {
          role: "user",
          content: `Translate the following text into ${targetLang}. Only output the translation:\n\n${trimmed}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new LlamaServiceError(`Llama server error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new LlamaServiceError("Empty translation from llama server.");
  }

  return {
    sourceText: trimmed,
    translatedText: content,
    targetLang,
  };
}

export function hasLocalLlmSettings(config: LocalLlmSettings): boolean {
  return Boolean(
    config.llamaCppPath.trim() &&
      config.modelPath.trim() &&
      config.enabled
  );
}