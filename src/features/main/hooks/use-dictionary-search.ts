import { useAtom, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  currentResultAtom,
  isSearchingAtom,
  isGeneratingFromLlmAtom,
  generatingModelAtom,
  queryHistoryAtom,
  setCurrentResultAtom,
  translationResultAtom,
} from "@/shared/state/dictionary";
import { settingsAtom } from "@/shared/state/settings";
import {
  queryDictionary,
  DictionaryQueryError,
  detectLanguage,
  resolvePairId,
  isSentence,
  type QueryResult,
  type Suggestion,
} from "@/shared/services/dictionary-service";
import {
  translateText,
  hasLlmCredentials,
  LlmServiceError,
} from "@/shared/services/llm-service";

export function useDictionarySearch() {
  const { t } = useTranslation();
  const [isSearching, setIsSearching] = useAtom(isSearchingAtom);
  const [isGeneratingFromLlm, setIsGeneratingFromLlm] = useAtom(isGeneratingFromLlmAtom);
  const [generatingModel, setGeneratingModel] = useAtom(generatingModelAtom);
  const [history] = useAtom(queryHistoryAtom);
  const [result] = useAtom(currentResultAtom);
  const setResult = useSetAtom(setCurrentResultAtom);
  const [translationResult, setTranslationResult] = useAtom(translationResultAtom);
  const [settings] = useAtom(settingsAtom);

  // Local state for suggestions — avoids atom re-render timing issues
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  // Real-time suggestion lookup (no LLM, no history write)
  const suggest = useCallback(
    async (word: string) => {
      const normalized = word.trim();
      if (normalized.length < 2) {
        setSuggestion(null);
        return;
      }

      const inputLang = detectLanguage(normalized);
      const pairId = resolvePairId(settings.dictionary.dictType, inputLang);

      try {
        const queryResult: QueryResult = await queryDictionary(normalized, pairId);
        if (queryResult.suggestion) {
          setSuggestion(queryResult.suggestion);
          setLastQuery(normalized);
        } else {
          setSuggestion(null);
        }
      } catch {
        setSuggestion(null);
      }
    },
    [settings.dictionary.dictType]
  );

  const search = useCallback(
    async (word: string) => {
      const normalized = word.trim();
      if (!normalized) {
        toast.error(t("main.search.empty_error"));
        return;
      }

      // Clear translation result when searching
      setTranslationResult(null);

      const inputLang = detectLanguage(normalized);
      const pairId = resolvePairId(settings.dictionary.dictType, inputLang);

      setIsSearching(true);
      setSuggestion(null);
      setLastQuery(normalized);

      try {
        const queryResult: QueryResult = await queryDictionary(normalized, pairId);

        if (queryResult.entry) {
          setSuggestion(null);
          setResult({ result: queryResult.entry, word: normalized });
          return;
        }

        if (queryResult.suggestion) {
          setSuggestion(queryResult.suggestion);
          setResult({ result: null, word: normalized });
          return;
        }

        // No entry, no suggestion — handle sentence/phrase vs single word
        if (!isSentence(normalized)) {
          toast.error(t("main.llm.not_found_word"));
          setIsSearching(false);
          return;
        }

        if (!settings.dictionary.cachePath.trim()) {
          toast.error(t("main.llm.missing_cache_path"));
          setIsSearching(false);
          return;
        }

        if (!hasLlmCredentials(settings.llm)) {
          toast.error(t("main.llm.missing_config"));
          setIsSearching(false);
          return;
        }

        setResult({ result: null });
        setGeneratingModel(settings.llm.model);
        setIsGeneratingFromLlm(true);

        try {
          // Detect target language from pairId (e.g., en_zh → Chinese)
          const targetLang = pairId.includes("zh") ? "Chinese" : "Spanish";
          const translated = await translateText(normalized, targetLang, settings.llm, {
            template: settings.promptTemplates.translation || undefined,
            glossary: settings.glossary,
          });
          setTranslationResult(translated);
        } catch (llmError) {
          console.error(llmError);
          let message: string;
          if (llmError instanceof LlmServiceError) {
            // Show the cause message if available (e.g., "invalid API key", "model not found")
            message = llmError.cause
              ? llmError.message
              : t("main.llm.error");
          } else {
            message = t("main.llm.error");
          }
          toast.error(message);
        } finally {
          setIsGeneratingFromLlm(false);
          setGeneratingModel(null);
        }
      } catch (error) {
        console.error(error);
        const fallbackMessage =
          error instanceof DictionaryQueryError
            ? error.message
            : t("main.errors.dictionary");
        toast.error(fallbackMessage);
      } finally {
        setIsSearching(false);
      }
    },
    [
      setResult,
      setIsSearching,
      setIsGeneratingFromLlm,
      setGeneratingModel,
      setTranslationResult,
      settings.dictionary.cachePath,
      settings.dictionary.dictType,
      settings.llm,
      t,
    ]
  );

  const clear = useCallback(() => {
    setResult({ result: null });
    setSuggestion(null);
    setTranslationResult(null);
    setLastQuery("");
  }, [setResult, setSuggestion, setTranslationResult]);

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
  }, [setSuggestion]);

  return {
    isSearching,
    isGeneratingFromLlm,
    generatingModel,
    history,
    result,
    suggestion,
    lastQuery,
    translationResult,
    search,
    suggest,
    clear,
    clearSuggestion,
  };
}