import OpenAI, { APIError } from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { WordDefinition } from "@/shared/types/dictionary";
import { LlmProvider } from "@/shared/types/settings";

export type LlmModelSummary = {
  id: string;
  ownedBy: string;
  created: number;
};

export class LlmServiceError extends Error {
  cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "LlmServiceError";
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

const RESPONSE_SCHEMA = z.object({
  word: z.string().min(1),
  pronunciation: z.string().min(1),
  concise_definition: z.string().min(1),
  forms: z.record(z.string(), z.string()),
  definitions: z
    .array(
      z.object({
        pos: z.string().min(1),
        explanation_en: z.string().min(1),
        explanation_cn: z.string().min(1),
        example_en: z.string().min(1),
        example_cn: z.string().min(1),
      })
    )
    .min(1),
  comparison: z.array(
    z.object({
      word_to_compare: z.string().min(1),
      analysis: z.string().min(1),
    })
  ),
});

type ParsedDefinition = z.infer<typeof RESPONSE_SCHEMA>;

type SanitizedConfig = {
  apiKey: string;
  baseURL?: string;
  model: string;
};

const DEFAULT_FORMS: Record<string, string> = {
  third_person_singular: "",
  past_tense: "",
  past_participle: "",
  present_participle: "",
  plural: "",
  comparative: "",
  superlative: "",
  singular: "",
};

const SYSTEM_PROMPT = `
你是一位严谨的双语词典编纂专家。你的任务是为一个给定的英语单词及其近义词生成一份详细的中文解释，并以严格的 JSON 格式输出。

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

export type TranslationResult = {
  sourceText: string;
  translatedText: string;
  targetLang: string;
};

function sanitizeConfig(config: LlmProvider): SanitizedConfig {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new LlmServiceError("LLM API key is missing.");
  }

  const model = config.model.trim();
  if (!model) {
    throw new LlmServiceError("LLM model is missing.");
  }

  const baseURL = (config.baseUrl || "").trim() || undefined;
  return { apiKey, baseURL, model };
}

function createClient(config: LlmProvider) {
  const sanitized = sanitizeConfig(config);
  return {
    client: new OpenAI({
      apiKey: sanitized.apiKey,
      baseURL: sanitized.baseURL,
      dangerouslyAllowBrowser: true,
    }),
    model: sanitized.model,
  };
}

function normalizeLlmError(error: unknown, fallback = "LLM request failed") {
  if (error instanceof LlmServiceError) {
    // If there's a cause with a meaningful message, include it in the error message
    if (error.cause) {
      const causeMessage =
        error.cause instanceof Error ? error.cause.message : String(error.cause);
      if (causeMessage && causeMessage !== error.message) {
        return new LlmServiceError(`${error.message}: ${causeMessage}`, {
          cause: error.cause,
        });
      }
    }
    return error;
  }

  if (error instanceof APIError) {
    return new LlmServiceError(error.message || fallback, { cause: error });
  }

  if (error instanceof Error) {
    return new LlmServiceError(error.message, { cause: error });
  }

  return new LlmServiceError(fallback);
}

function normalizeParsedDefinition(
  parsed: ParsedDefinition,
  fallbackWord: string
): WordDefinition {
  const word = parsed.word.trim() || fallbackWord;
  const forms = Object.entries(parsed.forms || {}).reduce<
    Record<string, string>
  >(
    (acc, [key, value]) => {
      acc[key] = typeof value === "string" ? value.trim() : "";
      return acc;
    },
    { ...DEFAULT_FORMS }
  );

  const sanitizedDefinitions = parsed.definitions.map((definition) => ({
    pos: definition.pos.trim(),
    explanation_en: definition.explanation_en.trim(),
    explanation_cn: definition.explanation_cn.trim(),
    example_en: definition.example_en.trim(),
    example_cn: definition.example_cn.trim(),
  }));

  const sanitizedComparison = parsed.comparison.map((item) => ({
    word_to_compare: item.word_to_compare.trim(),
    analysis: item.analysis.trim(),
  }));

  return {
    word,
    pronunciation: parsed.pronunciation.trim() || word,
    concise_definition:
      parsed.concise_definition.trim() || `Definition for ${word}`,
    forms,
    definitions: sanitizedDefinitions,
    comparison: sanitizedComparison,
  };
}

export function hasLlmCredentials(config: LlmProvider) {
  return Boolean(config.apiKey.trim() && config.model.trim());
}

export async function fetchAvailableModels(
  config: LlmProvider
): Promise<LlmModelSummary[]> {
  try {
    const { client } = createClient(config);
    const page = await client.models.list();
    return page.data
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((model) => ({
        id: model.id,
        ownedBy: model.owned_by,
        created: model.created,
      }));
  } catch (error) {
    throw normalizeLlmError(error, "Unable to load models from the provider.");
  }
}

export async function testLlmConnection(config: LlmProvider) {
  await fetchAvailableModels(config);
}

export async function generateDefinitionFromLlm(
  word: string,
  config: LlmProvider,
  options?: { systemPrompt?: string }
): Promise<WordDefinition> {
  const trimmed = word.trim();
  if (!trimmed) {
    throw new LlmServiceError("Word is required.");
  }

  const systemPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;

  try {
    const { client, model } = createClient(config);
    const completion = await client.chat.completions.parse({
      model,
      temperature: 0.1,
      response_format: zodResponseFormat(RESPONSE_SCHEMA, "word_definition"),
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: trimmed,
        },
      ],
    });

    const parsed = completion.choices[0]?.message.parsed;

    if (!parsed) {
      throw new LlmServiceError("LLM response was missing structured content.");
    }

    return normalizeParsedDefinition(parsed, trimmed);
  } catch (error) {
    throw normalizeLlmError(
      error,
      "Unable to generate a definition with the configured model."
    );
  }
}

const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translator. Translate user input accurately and fluently.";

export async function translateText(
  text: string,
  targetLang: string,
  config: LlmProvider,
  options?: {
    template?: string;
    glossary?: Array<{ source: string; target: string }>;
  }
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new LlmServiceError("Text is required.");
  }

  try {
    const { client, model } = createClient(config);

    let systemPrompt = TRANSLATION_SYSTEM_PROMPT;
    let userPrompt = `Translate the following text into ${targetLang}. Note that you should only output the translated result without any additional explanation:\n\n${trimmed}`;

    // Apply custom template if provided
    if (options?.template) {
      userPrompt = options.template
        .replace("{target_lang}", targetLang)
        .replace("{source_text}", trimmed);
    }

    // Inject glossary as system context if provided
    if (options?.glossary && options.glossary.length > 0) {
      const glossaryLines = options.glossary
        .map((e) => `  "${e.source}" → "${e.target}"`)
        .join("\n");
      systemPrompt =
        `${TRANSLATION_SYSTEM_PROMPT}\n\n## Terminology Glossary\nUse the following terms consistently:\n${glossaryLines}`;
    }

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const translated = completion.choices[0]?.message.content?.trim();

    if (!translated) {
      throw new LlmServiceError("Translation response was empty.");
    }

    return {
      sourceText: trimmed,
      translatedText: translated,
      targetLang,
    };
  } catch (error) {
    console.error("Translation error:", error);
    throw normalizeLlmError(error, "Translation failed.");
  }
}