import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/features/settings/hooks/use-settings";
import {
  startLlamaServer,
  stopLlamaServer,
  getLlamaServerStatus,
  getResourceDir,
} from "@/shared/services/llama-service";

const DEFAULT_TRANSLATION_PLACEHOLDER =
  "Translate the following text into {target_lang}. Note that you should only output the translated result without any additional explanation:\n\n{source_text}";

const DEFAULT_DEFINITION_PLACEHOLDER =
  "You are a bilingual dictionary expert. Your task is to generate a detailed Chinese explanation for a given English word...";

type LlmMode = "cloud" | "local";

export function LlmProvidersTab() {
  const { t } = useTranslation();
  const { settings, updateLlm, updateLocalLlm, updatePromptTemplates } = useSettings();
  const [mode, setMode] = useState<LlmMode>(
    settings.localLlm.enabled ? "local" : "cloud"
  );
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [resourceDir, setResourceDir] = useState<string>("");

  useEffect(() => {
    getResourceDir().then(setResourceDir).catch(() => {});
  }, []);

  useEffect(() => {
    setMode(settings.localLlm.enabled ? "local" : "cloud");
  }, [settings.localLlm.enabled]);

  const handleModeChange = (newMode: LlmMode) => {
    if (newMode === "local") {
      const defaultBinary = resourceDir
        ? `${resourceDir}\\binaries\\llama-server\\llama-server.exe`
        : "";
      const defaultModel = resourceDir
        ? `${resourceDir}\\models\\Hy-MT2-1.8B-Q4_K_M.gguf`
        : "";
      updateLocalLlm({
        enabled: true,
        binaryPath: settings.localLlm.binaryPath || defaultBinary,
        modelPath: settings.localLlm.modelPath || defaultModel,
      });
    } else {
      updateLocalLlm({ enabled: false });
    }
    setMode(newMode);
  };

  useEffect(() => {
    if (mode !== "local") {
      setIsServerRunning(false);
      setServerPort(0);
      return;
    }

    let unlisten: (() => void) | undefined;

    listen<{ running: boolean; port: number }>("llama-server-status", (event) => {
      setIsServerRunning(event.payload.running);
      setServerPort(event.payload.port);
      updateLocalLlm({
        serverPort: event.payload.running ? event.payload.port : 0,
      });
    }).then((fn) => {
      unlisten = fn;
    });

    getLlamaServerStatus()
      .then((status) => {
        setIsServerRunning(status.running);
        setServerPort(status.port);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      getLlamaServerStatus()
        .then((status) => {
          setIsServerRunning(status.running);
          setServerPort(status.port);
        })
        .catch(() => {});
    }, 5000);

    return () => {
      unlisten?.();
      clearInterval(interval);
    };
  }, [mode]);

  const handleBrowseBinary = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Executable", extensions: ["exe"] }],
      defaultPath: resourceDir
        ? `${resourceDir}\\binaries\\llama-server\\llama-server.exe`
        : undefined,
    });
    if (selected) {
      updateLocalLlm({ binaryPath: selected as string });
    }
  };

  const handleBrowseModel = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
      defaultPath: resourceDir
        ? `${resourceDir}\\models\\Hy-MT2-1.8B-Q4_K_M.gguf`
        : undefined,
    });
    if (selected) {
      updateLocalLlm({ modelPath: selected as string });
    }
  };

  const handleStartServer = async () => {
    if (!settings.localLlm.binaryPath.trim()) {
      toast.error("Please select llama-server.exe");
      return;
    }
    if (!settings.localLlm.modelPath.trim()) {
      toast.error("Please select the model file (.gguf)");
      return;
    }

    setIsStarting(true);
    try {
      const port = await startLlamaServer(
        settings.localLlm.binaryPath,
        settings.localLlm.modelPath,
        4096,
        99,
        settings.localLlm.serverPort || 11435
      );
      updateLocalLlm({ serverPort: port });
      setServerPort(port);
      setIsServerRunning(true);
      toast.success(`Llama server started on port ${port}`);
    } catch (error) {
      toast.error(`Failed to start llama server: ${error}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopServer = async () => {
    try {
      await stopLlamaServer();
      updateLocalLlm({ serverPort: 0 });
      setServerPort(0);
      setIsServerRunning(false);
      toast.success("Llama server stopped");
    } catch (error) {
      toast.error(`Failed to stop llama server: ${error}`);
    }
  };

  return (
    <div className="grid gap-6">
      {/* ── LLM Mode Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.llm.title")}</CardTitle>
              <CardDescription>{t("settings.llm.description")}</CardDescription>
            </div>
            <div className="flex rounded-md border bg-muted p-0.5 gap-0.5">
              <button
                onClick={() => handleModeChange("cloud")}
                className={`px-3 py-1 text-sm rounded-sm transition-colors ${
                  mode === "cloud"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cloud
              </button>
              <button
                onClick={() => handleModeChange("local")}
                className={`px-3 py-1 text-sm rounded-sm transition-colors ${
                  mode === "local"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Local
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6">
          {mode === "cloud" && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="llm-base-url">
                  {t("settings.llm.base_url.label")}
                </Label>
                <Input
                  id="llm-base-url"
                  placeholder={t("settings.llm.base_url.placeholder")}
                  value={settings.llm.baseUrl}
                  onChange={(e) =>
                    updateLlm({ baseUrl: e.target.value.trim() })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="llm-api-key">
                  {t("settings.llm.api_key.label")}
                </Label>
                <Input
                  id="llm-api-key"
                  type="password"
                  placeholder={t("settings.llm.api_key.placeholder")}
                  value={settings.llm.apiKey}
                  onChange={(e) => updateLlm({ apiKey: e.target.value })}
                />
              </div>
            </div>
          )}

          {mode === "local" && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>llama-server.exe</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    placeholder="Select llama-server.exe..."
                    value={settings.localLlm.binaryPath}
                    className="flex-1 bg-muted"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBrowseBinary}
                  >
                    Browse
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Model file (.gguf)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    placeholder="Select model file..."
                    value={settings.localLlm.modelPath}
                    className="flex-1 bg-muted"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBrowseModel}
                  >
                    Browse
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isServerRunning ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isServerRunning
                      ? `Running on port ${serverPort}`
                      : "Server not running"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartServer}
                    disabled={isServerRunning || isStarting}
                  >
                    {isStarting ? "Starting..." : "Start"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopServer}
                    disabled={!isServerRunning}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Prompts Card ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.prompts.title")}</CardTitle>
          <CardDescription>{t("settings.prompts.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("settings.prompts.translation_label")}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updatePromptTemplates({
                    translation: DEFAULT_TRANSLATION_PLACEHOLDER,
                  });
                  toast.success(t("settings.prompts.reset_success"));
                }}
                className="text-xs"
              >
                {t("settings.prompts.reset")}
              </Button>
            </div>
            <Textarea
              value={settings.promptTemplates.translation}
              onChange={(e) =>
                updatePromptTemplates({ translation: e.target.value })
              }
              placeholder={DEFAULT_TRANSLATION_PLACEHOLDER}
              className="min-h-[120px] font-mono text-xs"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("settings.prompts.definition_label")}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updatePromptTemplates({
                    definition: DEFAULT_DEFINITION_PLACEHOLDER,
                  });
                  toast.success(t("settings.prompts.reset_success"));
                }}
                className="text-xs"
              >
                {t("settings.prompts.reset")}
              </Button>
            </div>
            <Textarea
              value={settings.promptTemplates.definition}
              onChange={(e) =>
                updatePromptTemplates({ definition: e.target.value })
              }
              placeholder={DEFAULT_DEFINITION_PLACEHOLDER}
              className="min-h-[120px] font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
