import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDictionarySearch } from "@/features/main/hooks/use-dictionary-search";
import { ComparisonList } from "@/features/main/components/comparison-list";
import { DefinitionsList } from "@/features/main/components/definitions-list";
import { WordSummaryCard } from "@/features/main/components/word-summary";
import type { Suggestion } from "@/shared/services/dictionary-service";
import type { TranslationResult } from "@/shared/services/llm-service";

function SuggestionPanel({
  suggestion,
  query,
  onSelect,
}: {
  suggestion: Suggestion;
  query: string;
  onSelect: (word: string) => void;
}) {
  const { t } = useTranslation();

  if (suggestion.type === "Prefix") {
    return (
      <div className="bg-muted/50 border-border w-full max-w-2xl rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">
          {t("main.search.suggestion.prefix", { query })}
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestion.words.map((word) => (
            <button
              key={word}
              onClick={() => onSelect(word)}
              className="bg-background hover:bg-accent cursor-pointer rounded border px-2 py-0.5 text-sm transition-colors"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (suggestion.type === "Spellcheck") {
    return (
      <div className="bg-muted/50 border-border w-full max-w-2xl rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">
          {t("main.search.suggestion.spellcheck", { query })}
        </span>
        <div className="mt-1.5 flex flex-col gap-1">
          {suggestion.candidates.map((c) => (
            <button
              key={c.word}
              onClick={() => onSelect(c.word)}
              className="bg-background hover:bg-accent cursor-pointer rounded border px-2 py-0.5 text-sm text-left transition-colors"
            >
              <span className="font-medium">{c.word}</span>
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({t("main.search.suggestion.distance", { n: c.distance })})
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (suggestion.type === "Lemma") {
    return (
      <div className="bg-muted/50 border-border w-full max-w-2xl rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">
          {t("main.search.suggestion.lemma", {
            query,
            lemma: suggestion.lemma,
          })}
        </span>
        <div className="mt-1.5">
          <button
            onClick={() => onSelect(suggestion.lemma)}
            className="bg-background hover:bg-accent cursor-pointer rounded border px-2.5 py-0.5 text-sm transition-colors"
          >
            {t("main.search.suggestion.view_lemma", {
              lemma: suggestion.lemma,
            })}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function TranslationDisplay({
  translation,
}: {
  translation: TranslationResult;
}) {
  return (
    <div className="bg-card border-border mx-auto w-full max-w-2xl rounded-lg border p-4">
      <p className="text-muted-foreground text-xs whitespace-pre-wrap break-words">
        {translation.sourceText}
      </p>
      <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap break-words">
        {translation.translatedText}
      </p>
    </div>
  );
}

export function MainPage() {
  const { t } = useTranslation();
  const {
    isGeneratingFromLlm,
    generatingModel,
    result,
    suggestion,
    lastQuery,
    translationResult,
    search,
  } = useDictionarySearch();

  useEffect(() => {
    // focus-search-input is now handled directly via SmartDictInputRef in AppLayout
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center gap-4">
        {suggestion && !isGeneratingFromLlm && (
          <SuggestionPanel
            suggestion={suggestion}
            query={lastQuery}
            onSelect={search}
          />
        )}
        {!result &&
          !suggestion &&
          !isGeneratingFromLlm &&
          !translationResult && (
            <p className="text-muted-foreground text-sm">
              {t("main.empty_state")}
            </p>
          )}
      </div>

      {isGeneratingFromLlm && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">
            {t("main.llm.generating_status", { model: generatingModel })}
          </p>
        </div>
      )}

      {translationResult && !isGeneratingFromLlm && (
        <TranslationDisplay translation={translationResult} />
      )}

      {result && !isGeneratingFromLlm && (
        <div className="flex flex-col gap-6">
          <WordSummaryCard definition={result} />
          <div className="flex flex-col gap-4">
            <DefinitionsList definition={result} />
          </div>
          <ComparisonList definition={result} />
        </div>
      )}
    </div>
  );
}
