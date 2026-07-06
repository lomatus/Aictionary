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
import { Switch } from "@/components/ui/switch";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "@/features/settings/hooks/use-settings";
import {
  startLlamaServer,
  stopLlamaServer,
  getLlamaServerStatus,
} from "@/shared/services/llama-service";

const DEFAULT_TRANSLATION_PLACEHOLDER =
  "Translate the following text into {target_lang}. Note that you should only output the translated result without any additional explanation:\n\n{source_text}";

const DEFAULT_DEFINITION_PLACEHOLDER =
  "You are a bilingual dictionary expert. Your task is to generate a detailed Chinese explanation for a given English word...";

export function LlmProvidersTab() {
  const { t } = useTranslation();
  const { settings, updateLlm, updateLocalLlm, updatePromptTemplates } = useSettings();
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!settings.localLlm.enabled) {
      setIsServerRunning(false);
      setServerPort(0);
      return;
    }

    let unlisten: (() => void) | undefined;

    listen<{ running: boolean; port: number }>("llama-server-status", (event) => {
      setIsServerRunning(event.payload.running);
      setServerPort(event.payload.port);
      if (event.payload.running) {
        updateLocalLlm({ serverPort: event.payload.port });
      } else {
        updateLocalLlm({ serverPort: 0 });
      }
    }).then((fn) => {
      unlisten = fn;
    });

    getLlamaServerStatus()
      .then((status) => {
        setIsServerRunning(status.running);
        setServerPort(status.port);
      })
      .catch(() => {
        setIsServerRunning(false);
        setServerPort(0);
      });

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
  }, [settings.localLlm.enabled]);

  const handleStartServer = async () => {
    if (!settings.localLlm.binaryPath.trim()) {
      toast.error("Please enter the path to llama-server.exe");
      return;
    }
    if (!settings.localLlm.modelPath.trim()) {
      toast.error("Please enter the path to the model file (.gguf)");
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
      {!settings.localLlm.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.llm.title")}</CardTitle>
            <CardDescription>{t("settings.llm.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="llm-base-url">{t("settings.llm.base_url.label")}</Label>
              <Input
                id="llm-base-url"
                placeholder={t("settings.llm.base_url.placeholder")}
                value={settings.llm.baseUrl}
                onChange={(e) => updateLlm({ baseUrl: e.target.value.trim() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="llm-api-key">{t("settings.llm.api_key.label")}</Label>
              <Input
                id="llm-api-key"
                type="password"
                placeholder={t("settings.llm.api_key.placeholder")}
                value={settings.llm.apiKey}
                onChange={(e) => updateLlm({ apiKey: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Local Inference</CardTitle>
          <CardDescription>
            Use a local llama-server binary with a GGUF model instead of a cloud API.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="grid gap-1">
              <Label>Enable Local Inference</Label>
              <p className="text-xs text-muted-foreground">
                Requires llama-server and a GGUF model on your machine
              </p>
            </div>
            <Switch
              checked={settings.localLlm.enabled}
              onCheckedChange={(checked) => updateLocalLlm({ enabled: checked })}
            />
          </div>

          {settings.localLlm.enabled && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="llama-binary-path">llama-server.exe path</Label>
                <Input
                  id="llama-binary-path"
                  placeholder="C:\path\to\llama-server.exe"
                  value={settings.localLlm.binaryPath}
                  onChange={(e) =>
                    updateLocalLlm({ binaryPath: e.target.value.trim() })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="llama-model-path">Model file path (.gguf)</Label>
                <Input
                  id="llama-model-path"
                  placeholder="C:\path\to\Hy-MT2-1.8B-Q4_K_M.gguf"
                  value={settings.localLlm.modelPath}
                  onChange={(e) =>
                    updateLocalLlm({ modelPath: e.target.value.trim() })
                  }
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isServerRunning ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm">
                    {isServerRunning
                      ? `Running on port ${serverPort}`
                      : "Stopped"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartServer}
                    disabled={isServerRunning || isStarting}
                  >
                    {isStarting ? "Starting..." : "Start Server"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopServer}
                    disabled={!isServerRunning}
                  >
                    Stop Server
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!settings.localLlm.enabled && (
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
                    updatePromptTemplates({ translation: DEFAULT_TRANSLATION_PLACEHOLDER });
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
                    updatePromptTemplates({ definition: DEFAULT_DEFINITION_PLACEHOLDER });
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
      )}
    </div>
  );
}
