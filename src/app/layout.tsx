import { Outlet, useNavigate, useLocation } from "react-router";
import { BookOpenText, BarChart2, Settings } from "lucide-react";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useDictionarySearch } from "@/features/main/hooks/use-dictionary-search";
import { useGlobalShortcuts } from "@/shared/hooks/use-global-shortcuts";
import { SearchProvider } from "@/shared/contexts/search-context";
import { SearchForm } from "@/features/main/components/search-form";

export function AppLayout() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const { search, suggest, isSearching } = useDictionarySearch();

  const isDictionaryTab = location.pathname === "/";

  const handleBookIconClick = () => {
    if (!isDictionaryTab) {
      navigate("/");
      return;
    }
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    const currentValue = textarea?.value ?? "";
    if (currentValue.trim()) {
      search(currentValue);
    } else {
      window.dispatchEvent(new CustomEvent("focus-search-input"));
    }
  };

  useGlobalShortcuts({
    quickQuery: settings.keyboard.quickQuery,
    newQuery: settings.keyboard.newQuery,
    enabled: settings.keyboard.enabled,
    onQuickQuery: (text) => {
      navigate("/");
      search(text);
    },
    onNewQuery: () => {
      navigate("/");
      window.dispatchEvent(new CustomEvent("focus-search-input"));
    },
  });

  useEffect(() => {
    const unlistenPromise = listen("open-settings-about", () => {
      navigate("/settings/about");
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [navigate]);

  return (
    <SearchProvider search={search} suggest={suggest} isSearching={isSearching}>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <header className="border-b sticky top-0 z-50 bg-background">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 mt-px">
            {/* Left: Book icon — acts as search on dictionary tab */}
            <button
              onClick={handleBookIconClick}
              className="text-primary hover:text-primary/80 shrink-0 rounded-md p-2 transition-colors hover:bg-muted/60"
              title={t("nav.dictionary")}
              type="button"
            >
              <BookOpenText className="size-5" />
            </button>

            {/* Center: Search form */}
            <div className="flex flex-1 items-center">
              <SearchForm />
            </div>

            {/* Right: icon-only nav */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => navigate("/statistics")}
                className="text-muted-foreground hover:text-foreground inline-flex items-center rounded-md p-2 transition-colors hover:bg-muted/60"
                title={t("nav.statistics")}
                type="button"
              >
                <BarChart2 className="size-5" />
              </button>
              <button
                onClick={() => navigate("/settings")}
                className="text-muted-foreground hover:text-foreground inline-flex items-center rounded-md p-2 transition-colors hover:bg-muted/60"
                title={t("nav.settings")}
                type="button"
              >
                <Settings className="size-5" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
          <Outlet />
        </main>
      </div>
    </SearchProvider>
  );
}
