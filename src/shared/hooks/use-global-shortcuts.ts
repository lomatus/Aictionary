import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface UseGlobalShortcutsOptions {
  quickQuery: string;
  newQuery: string;
  enabled: boolean;
  onQuickQuery: (text: string) => void;
  onNewQuery: () => void;
}

export function useGlobalShortcuts({
  quickQuery,
  newQuery,
  enabled,
  onQuickQuery,
  onNewQuery,
}: UseGlobalShortcutsOptions) {
  // Track whether settings have been loaded from localStorage.
  // On first render the atom returns the default value before hydration,
  // so we skip shortcut setup until we see a value that differs from
  // the hard-coded defaults in defaultSettings — which only happens once
  // localStorage has been read.
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip on the very first render when defaults are still active.
    // atomWithStorage hydrates asynchronously from localStorage, so the
    // effect runs twice: first with defaults, then with persisted values.
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const setupShortcuts = async () => {
      try {
        await invoke("setup_shortcuts", {
          quickQuery,
          newQuery,
          enabled,
        });
      } catch (error) {
        console.error("Failed to setup shortcuts:", error);
      }
    };

    setupShortcuts();
  }, [quickQuery, newQuery, enabled]);

  useEffect(() => {
    const unlisten = listen<string>("quick-query", (event) => {
      onQuickQuery(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onQuickQuery]);

  useEffect(() => {
    const unlisten = listen("new-query", () => {
      onNewQuery();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onNewQuery]);
}
