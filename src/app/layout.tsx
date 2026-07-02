import { Outlet, useNavigate } from "react-router";
import { BarChart2, Settings, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useDictionarySearch } from "@/features/main/hooks/use-dictionary-search";
import { useGlobalShortcuts } from "@/shared/hooks/use-global-shortcuts";
import { SearchProvider } from "@/shared/contexts/search-context";
import { useTheme } from "next-themes";
import { useSetAtom } from "jotai";
import { updateSettingsAtom } from "@/shared/state/settings";
import { SmartDictInput } from "@/components/ui/smart-dict-input";
import type { SmartDictInputRef } from "@/components/ui/smart-dict-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppLayout() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { search, suggest, isSearching } = useDictionarySearch();
  const updateSettings = useSetAtom(updateSettingsAtom);
  const smartInputRef = useRef<SmartDictInputRef>(null);

  function isTauri() {
    return typeof window !== "undefined" && "__TAURI__" in window;
  }

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
      smartInputRef.current?.focusInput();
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

  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === "dark" ? "/logo_dark.png" : "/logo.png";
  const handleClose = () => getCurrentWindow().close();

  return (
    <SearchProvider search={search} suggest={suggest} isSearching={isSearching}>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <header className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-full items-center gap-2 px-4 mt-px">
            <div className="titlebar" data-tauri-drag-region>
              <img
                src={logoSrc}
                alt="Aictionary"
                className="h-[50px] w-[50px] object-contain"
              />
            </div>
            <div className="flex flex-1">
              <Select
                value={settings.dictionary.dictType}
                onValueChange={(val) =>
                  updateSettings({ dictionary: { ...settings.dictionary, dictType: val } })
                }
              >
                <SelectTrigger className="bg-transparent shrink-0 font-mono text-xs font-extrabold h-9 border-0 px-1 mt-2">
                  <SelectValue className="text-primary font-extrabold" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">AU</SelectItem>
                  <SelectItem value="en_zh">EN</SelectItem>
                  <SelectItem value="zh_en">CN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SmartDictInput
              ref={smartInputRef}
              onWordLookup={search}
              onTranslate={search}
              onSuggest={suggest}
              onFocus={() => navigate("/")}
              suggestions={[]}
            />

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
              {isTauri() && (
                <button
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center rounded-md p-2 transition-colors hover:bg-muted/60"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>

        <main
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-5 mt-5 pb-6 overflow-y-auto"
          style={{ maxHeight: "calc(100dvh - 100px)" }}
        >
          <Outlet />
        </main>
      </div>
    </SearchProvider>
  );
}