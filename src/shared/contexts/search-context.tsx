import { createContext, useContext, type ReactNode } from "react";

export interface SearchContextValue {
  search: (word: string) => void;
  suggest: (word: string) => void;
  isSearching: boolean;
}

export const SearchContext = createContext<SearchContextValue>({
  search: () => {},
  suggest: () => {},
  isSearching: false,
});

export function SearchProvider({
  children,
  search,
  suggest,
  isSearching,
}: SearchContextValue & { children: ReactNode }) {
  return (
    <SearchContext.Provider value={{ search, suggest, isSearching }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearchContext() {
  return useContext(SearchContext);
}
