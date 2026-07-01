import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { formatDistanceToNow } from "date-fns";
import { DownloadDialog } from "@/shared/components/download-dialog";
import { getLatestDictionaryRelease } from "@/shared/services/github-service";
import type { DownloadOptions } from "@/shared/types/download";
import { MIN_FULL_DICTIONARY_ENTRIES } from "@/shared/constants/dictionary";

type DictType = "en-zh" | "zh-en";

export function DictionaryTab() {
  const { t } = useTranslation();
  const { settings, updateDictionary } = useSettings();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions | null>(null);
  const [downloadDictType, setDownloadDictType] = useState<DictType>("en-zh");
  const [dbPath, setDbPath] = useState<string>("");

  // Get the actual db path from Tauri backend on mount
  useEffect(() => {
    invoke<string>("get_actual_db_path")
      .then((path) => {
        setDbPath(path);
      })
      .catch(console.error);
  }, []);

  // Fallback if not loaded yet
  const displayPath = dbPath || "%LOCALAPPDATA%\\aictionary-re\\dictionary.db";
  const handleCheckCompleteness = async () => {
    const cachePath = settings.dictionary.cachePath.trim();
    if (!cachePath) {
      toast.error(t("settings.dictionary.toast.browse_error"));
      return;
    }

    setIsChecking(true);
    try {
      const count = await invoke<number>("count_dictionary_entries", {
        cachePath,
      });

      if (count > MIN_FULL_DICTIONARY_ENTRIES) {
        toast.success(
          t("settings.dictionary.toast.check_complete", {
            count,
          })
        );
      } else {
        toast.warning(
          t("settings.dictionary.toast.check_incomplete", {
            count,
            required: MIN_FULL_DICTIONARY_ENTRIES,
          })
        );
      }
    } catch (error) {
      console.warn("Failed to check dictionary cache completeness:", error);
      toast.error(t("settings.dictionary.toast.check_error"));
    } finally {
      setIsChecking(false);
    }
  };

  const handleRedownload = async () => {
    if (!settings.dictionary.cachePath) {
      toast.error(t("settings.dictionary.toast.browse_error"));
      return;
    }

    setIsRefreshing(true);
    try {
      // Fetch the latest release from GitHub
      const release = await getLatestDictionaryRelease(downloadDictType);

      // Prepare download options
      const zipFileName = release.fileName;
      const cachePath = settings.dictionary.cachePath.replace(/[\/\\]+$/, ""); // Remove trailing slashes

      // Extract to parent directory since zip contains 'dictionary' folder
      const lastSlashIndex = Math.max(
        cachePath.lastIndexOf("/"),
        cachePath.lastIndexOf("\\")
      );
      const parentDir =
        lastSlashIndex > 0 ? cachePath.substring(0, lastSlashIndex) : cachePath;
      const zipPath = `${parentDir}/${zipFileName}`;

      const options: DownloadOptions = {
        url: release.downloadUrl,
        filePath: zipPath,
        maxRetries: 3,
        extractAfterDownload: true,
        extractTo: parentDir, // Extract to parent dir, zip creates 'dictionary' folder
        onComplete: (result) => {
          console.log("Dictionary downloaded:", result);
        },
        onExtractComplete: () => {
          console.log("Dictionary extracted successfully");
        },
      };

      setDownloadOptions(options);
      setDownloadDialogOpen(true);
    } catch (error) {
      console.warn("Failed to fetch dictionary release:", error);
      toast.error(t("settings.dictionary.toast.redownload_error"));
      setIsRefreshing(false);
    }
  };

  const handleOpenCache = async () => {
    if (!settings.dictionary.cachePath) {
      toast.error(t("settings.dictionary.toast.show_error"));
      return;
    }
    try {
      await openPath(settings.dictionary.cachePath);
    } catch (error) {
      console.warn(error);
      toast.error(t("settings.dictionary.toast.show_error"));
    }
  };

  const handleDownloadSuccess = () => {
    const timestamp = new Date().toISOString();
    updateDictionary({ lastUpdated: timestamp });
    toast.success(t("settings.dictionary.toast.redownload_success"));
    setIsRefreshing(false);
  };

  return (
    <>
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.dictionary.cache.title")}</CardTitle>
            <CardDescription>
              {t("settings.dictionary.why.items.0")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("settings.dictionary.cache.db_label")}</Label>
              <Input
                value={displayPath}
                readOnly
                className="bg-muted font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t("settings.dictionary.cache.last_updated")}</span>
              <span className="font-medium text-foreground">
                {settings.dictionary.lastUpdated
                  ? formatDistanceToNow(
                      new Date(settings.dictionary.lastUpdated),
                      {
                        addSuffix: true,
                      }
                    )
                  : t("settings.dictionary.cache.never")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRedownload} disabled={isRefreshing}>
                {isRefreshing
                  ? "Refreshing…"
                  : t("settings.dictionary.cache.button_redownload")}
              </Button>
              <Button
                variant="outline"
                onClick={handleCheckCompleteness}
                disabled={isChecking}
              >
                {isChecking
                  ? t("settings.dictionary.cache.button_checking")
                  : t("settings.dictionary.cache.button_check")}
              </Button>
              <Button variant="outline" onClick={handleOpenCache}>
                {t("settings.dictionary.cache.button_show")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  updateDictionary({ cachePath: "", lastUpdated: null });
                  toast.success(t("settings.dictionary.toast.clear_success"));
                }}
              >
                {t("settings.dictionary.cache.button_clear")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DownloadDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        downloadOptions={downloadOptions}
        onSuccess={handleDownloadSuccess}
        dictType={downloadDictType}
        onDictTypeChange={setDownloadDictType}
        showDictTypeSelect={true}
      />
    </>
  );
}