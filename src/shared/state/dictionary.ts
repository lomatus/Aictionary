import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { QueryRecord, WordDefinition } from "@/shared/types/dictionary";
import type { Suggestion } from "@/shared/services/dictionary-service";
import type { TranslationResult } from "@/shared/services/llm-service";

export const currentResultAtom = atom<WordDefinition | null>(null);
export const isSearchingAtom = atom(false);
export const isGeneratingFromLlmAtom = atom(false);
export const generatingModelAtom = atom<string | null>(null);
export const suggestionAtom = atom<Suggestion | null>(null);
export const lastQueryAtom = atom<string>("");
export const translationResultAtom = atom<TranslationResult | null>(null);

export const queryHistoryAtom = atomWithStorage<QueryRecord[]>(
  "aictionary-query-history",
  []
);

export const setCurrentResultAtom = atom(
  null,
  (get, set, payload: { result: WordDefinition | null; word?: string }) => {
    set(currentResultAtom, payload.result);

    if (payload.result && payload.word) {
      const history = get(queryHistoryAtom);
      const timestamp = new Date().toISOString();
      const updated = [{ word: payload.word, timestamp }, ...history].slice(
        0,
        500
      );
      set(queryHistoryAtom, updated);
    }
  }
);