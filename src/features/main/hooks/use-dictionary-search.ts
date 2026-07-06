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
import { translateTextWithLlama } from "@/shared/services/llama-service";

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

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const suggest = useCallback(
    async (word: string): Promise<string[]> => {
      const normalized = word.trim();
      if (!normalized) return [];
      if (!settings.dictionary.cachePath.trim()) return [];
      try {
        const lang = detectLanguage(normalized);
        const pairId = resolvePairId(settings.dictionary.dictType, lang);
        const r = await queryDictionary(normalized, pairId);
        if (!r.suggestion) return [];
        if (r.suggestion.type === "Spellcheck") {
          return r.suggestion.candidates.map((c) => c.word);
        }
        if (r.suggestion.type === "Prefix") {
          return r.suggestion.words;
        }
        return [];
      } catch {
        return [];
      }
    },
    [settings.dictionary.dictType, settings.dictionary.cachePath]
  );

  const search = useCallback(
    async (word: string) => {
      const normalized = word.trim();
      if (!normalized) {
        toast.error(t("main.search.empty_error"));
        return;
      }

      setTranslationResult(null);

      const inputLang = detectLanguage(normalized);
      const pairId = resolvePairId(settings.dictionary.dictType, inputLang);
      console.log("[search] inputLang:", inputLang, "dictType:", settings.dictionary.dictType, "pairId:", pairId);

      setIsSearching(true);
      setSuggestion(null);
      setLastQuery(normalized);

      try {
        const queryResult: QueryResult = await queryDictionary(normalized, pairId);
        console.log("[search] queryResult:", JSON.stringify(queryResult));

        if (queryResult.entry) {
          setSuggestion(null);
          setResult({ result: queryResult.entry, word: normalized });
          setIsSearching(false);
          return;
        }

        if (queryResult.suggestion) {
          setSuggestion(queryResult.suggestion);
          setResult({ result: null, word: normalized });
          setIsSearching(false);
          return;
        }

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

        // ── Local LLM path ─────────────────────────────────────────────
        if (settings.localLlm.enabled && settings.localLlm.binaryPath.trim()) {
          setResult({ result: null });
          setGeneratingModel("local");
          setIsGeneratingFromLlm(true);

          try {
            const targetLang = pairId.includes("zh") ? "Chinese" : "Spanish";

            const translated = await translateTextWithLlama(
              normalized,
              targetLang,
              settings.localLlm.serverPort || 11435
            );
            setTranslationResult({
              sourceText: normalized,
              translatedText: translated.translatedText,
              targetLang,
            });
          } catch (llmError) {
            console.error(llmError);
            toast.error(t("main.llm.error"));
          } finally {
            setIsGeneratingFromLlm(false);
            setGeneratingModel(null);
          }
          return;
        }

        // ── Remote LLM path ────────────────────────────────────────────
        if (!hasLlmCredentials(settings.llm)) {
          toast.error(t("main.llm.missing_config"));
          setIsSearching(false);
          return;
        }

        setResult({ result: null });
        setGeneratingModel(settings.llm.model);
        setIsGeneratingFromLlm(true);

        try {
          const targetLang = pairId.includes("zh") ? "Chinese" : "Spanish";
          const translated = await translateText(normalized, targetLang, settings.llm, {
            template: settings.promptTemplates.translation || undefined,
            glossary: settings.glossary,
          });
          setTranslationResult(translated);
        } catch (llmError) {
          console.error(llmError);
          const message =
            llmError instanceof LlmServiceError
              ? llmError.cause
                ? llmError.message
                : t("main.llm.error")
              : t("main.llm.error");
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
      setSuggestion,
      setTranslationResult,
      settings.localLlm,
      settings.llm,
      settings.dictionary,
      settings.glossary,
      settings.promptTemplates,
      t,
    ]
  );

  const clear = useCallback(() => {
    setResult({ result: null });
    setSuggestion(null);
    setTranslationResult(null);
  }, [setResult, setSuggestion, setTranslationResult]);

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
  }, [setSuggestion]);

  return {
    search,
    suggest,
    clear,
    clearSuggestion,
    isSearching,
    suggestion,
    lastQuery,
    history,
    result,
    translationResult,
    isGeneratingFromLlm,
    generatingModel,
  };
}
