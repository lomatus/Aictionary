import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { getLatestDictionaryRelease } from "@/shared/services/github-service";
import { DownloadDialog } from "@/shared/components/download-dialog";
import type { DownloadOptions } from "@/shared/types/download";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MIN_FULL_DICTIONARY_ENTRIES } from "@/shared/constants/dictionary";

/**
 * Ensures the dictionary SQLite cache is populated once when the app boots.
 * Without this, lookups run before the user opens the settings page fall
 * back to the mock definition because the cache path stays empty.
 *
 * The old JSON-file-based cache has been replaced by a SQLite database.
 * After downloading and extracting the zip, we call import_dictionary_from_dir
 * to populate the SQLite tables.
 */
export function DictionaryCacheSync() {
  const { t } = useTranslation();
  const { settings, updateDictionary } = useSettings();
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions | null>(null);
  const [resolvedCachePath, setResolvedCachePath] = useState<string | null>(null);
  const [incompleteDialogOpen, setIncompleteDialogOpen] = useState(false);
  const [entryCount, setEntryCount] = useState<number | null>(null);

  useEffect(() => {
    console.log("[DictionaryCacheSync] Mounted with settings:", settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    const initializePath = async () => {
      try {
        let cachePath = settings.dictionary.cachePath;

        if (!cachePath) {
          const defaultPath = await invoke<string>("get_default_dictionary_path");
          if (cancelled || !defaultPath) {
            return;
          }

          cachePath = defaultPath;

          updateDictionary((prev) => {
            if (prev.cachePath) {
              return prev;
            }
            return {
              ...prev,
              cachePath: defaultPath,
            };
          });
        }

        if (cancelled || !cachePath) {
          return;
        }

        setResolvedCachePath(cachePath);
        console.log("[DictionaryCacheSync] Using cache path:", cachePath);

        // Check if SQLite cache actually has entries.
        const cacheExists = await invoke<boolean>("check_dictionary_cache_exists", {
          cachePath,
        });

        if (!cancelled) {
          if (!cacheExists) {
            console.log("[DictionaryCacheSync] No dictionary entries in SQLite cache.");
            setEntryCount(0);
            setIncompleteDialogOpen(true);
            return;
          }

          // Cache exists, verify it looks complete.
          try {
            const count = await invoke<number>("count_dictionary_entries", {
              cachePath,
            });
            console.log("[DictionaryCacheSync] Dictionary entry count:", count);

            if (count <= MIN_FULL_DICTIONARY_ENTRIES) {
              setEntryCount(count);
              setIncompleteDialogOpen(true);
            }
          } catch (error) {
            console.warn("Failed to check dictionary entry count:", error);
          }
        }
      } catch (error) {
        console.warn("Failed to initialize dictionary cache path:", error);
      }
    };

    void initializePath();

    return () => {
      cancelled = true;
    };
  }, [settings.dictionary.cachePath, updateDictionary]);

  const handleDownloadSuccess = async () => {
    const timestamp = new Date().toISOString();
    updateDictionary({ lastUpdated: timestamp });
    // Re-check entry count after download/import
    if (resolvedCachePath) {
      try {
        const count = await invoke<number>("count_dictionary_entries", {
          cachePath: resolvedCachePath,
        });
        console.log("[DictionaryCacheSync] Entry count after import:", count);
        setEntryCount(count);
      } catch (error) {
        console.warn("Failed to re-check entry count:", error);
      }
    }
  };

  const handleConfirmRedownload = async () => {
    if (!resolvedCachePath) {
      return;
    }

    try {
      const release = await getLatestDictionaryRelease();
      const normalizedPath = resolvedCachePath.replace(/[/\\]+$/, "");
      const lastSlashIndex = Math.max(
        normalizedPath.lastIndexOf("/"),
        normalizedPath.lastIndexOf("\\")
      );
      const parentDir =
        lastSlashIndex > 0
          ? normalizedPath.substring(0, lastSlashIndex)
          : normalizedPath;
      const zipFileName = "open-english-dictionary.zip";
      const zipPath = `${parentDir}/${zipFileName}`;

      const options: DownloadOptions = {
        url: release.downloadUrl,
        filePath: zipPath,
        maxRetries: 3,
        extractAfterDownload: true,
        extractTo: parentDir,
        onExtractComplete: async () => {
          console.log("[DictionaryCacheSync] Extraction complete, importing into SQLite...");
          // After extraction, import the JSON files into the SQLite database
          const extractedDir = `${parentDir}/open-english-dictionary`;
          try {
            const imported = await invoke<number>("import_dictionary_from_dir", {
              sourceDir: extractedDir,
              dictType: "en_zh",
            });
            console.log("[DictionaryCacheSync] Imported", imported, "entries into SQLite.");
            await handleDownloadSuccess();
          } catch (error) {
            console.error("[DictionaryCacheSync] Failed to import dictionary:", error);
          }
        },
      };

      setDownloadOptions(options);
      setDownloadDialogOpen(true);
    } catch (error) {
      console.warn("Failed to initiate dictionary re-download:", error);
    }
  };

  return (
    <>
      <DownloadDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        downloadOptions={downloadOptions}
        onSuccess={handleDownloadSuccess}
      />

      <AlertDialog open={incompleteDialogOpen} onOpenChange={setIncompleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.dictionary.incomplete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.dictionary.incomplete.description", {
                count: entryCount ?? 0,
                required: MIN_FULL_DICTIONARY_ENTRIES,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.dictionary.incomplete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIncompleteDialogOpen(false);
                void handleConfirmRedownload();
              }}
            >
              {t("settings.dictionary.incomplete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}