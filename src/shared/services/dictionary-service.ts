import { invoke } from "@tauri-apps/api/core";
import { WordDefinition } from "@/shared/types/dictionary";

export type DictionaryErrorCode =
  | "NOT_FOUND"
  | "MISSING_CACHE_PATH"
  | "INVALID_WORD"
  | "UNKNOWN";

export class DictionaryQueryError extends Error {
  constructor(
    message: string,
    public readonly code: DictionaryErrorCode,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "DictionaryQueryError";
    if (options?.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function parseErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function determineErrorCode(message: string): DictionaryErrorCode {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) {
    return "NOT_FOUND";
  }
  if (normalized.includes("cache path") && normalized.includes("not configured")) {
    return "MISSING_CACHE_PATH";
  }
  if (normalized.includes("word is required")) {
    return "INVALID_WORD";
  }
  return "UNKNOWN";
}

export type Suggestion =
  | { type: "Prefix"; words: string[] }
  | { type: "Spellcheck"; candidates: Array<{ word: string; distance: number }> }
  | { type: "Lemma"; lemma: string };

export type QueryResult = {
  entry: WordDefinition | null;
  suggestion: Suggestion | null;
};

export async function queryDictionary(
  word: string,
  dictType?: string
): Promise<QueryResult> {
  const trimmedWord = word.trim();
  if (!trimmedWord) {
    throw new DictionaryQueryError("Word is required", "INVALID_WORD");
  }

  try {
    return await invoke<QueryResult>("dictionary_query", {
      word: trimmedWord,
      dictType: dictType ?? null,
    });
  } catch (error) {
    const message = parseErrorMessage(error);
    throw new DictionaryQueryError(message, determineErrorCode(message), { cause: error });
  }
}

export async function writeDictionaryEntry(
  definition: WordDefinition,
  dictType?: string
) {
  await invoke("upsert_dictionary_entry", {
    args: {
      entry: definition,
      dictType: dictType ?? "en_zh",
    },
  });
}

/** Detects whether input text is primarily Chinese (CJK Unified Ideographs). */
export function detectLanguage(text: string): string {
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  return cjkRegex.test(text) ? "zh" : "en";
}

/** Detects the language pair based on input language and dictType setting. */
export function resolvePairId(dictType: string, inputLang: string): string {
  if (dictType === "auto") {
    // Map source language to default target for that source
    const pairMap: Record<string, string> = {
      en: "en_zh",
      zh: "zh_en",
      es: "en_es",
    };
    return pairMap[inputLang] ?? "en_zh";
  }
  return dictType;
}

/** Returns true if input looks like a sentence/phrase (not a single word). */
export function isSentence(text: string): boolean {
  return text.includes(" ") || text.length > 30;
}