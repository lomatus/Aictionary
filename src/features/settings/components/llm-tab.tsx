import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/features/settings/hooks/use-settings";
import {
  fetchAvailableModels,
  LlmModelSummary,
  LlmServiceError,
  testLlmConnection,
} from "@/shared/services/llm-service";
import {
  downloadLlamaCpp,
  downloadModel,
  getDefaultModelDir,
  isLlamaServerRunning,
  startLlamaServer,
  stopLlamaServer,
  LlamaDownloadStatus,
} from "@/shared/services/llama-service";

const DEFAULT_TRANSLATION_PLACEHOLDER =
  "Translate the following text into {target_lang}. Note that you should only output the translated result without any additional explanation:\n\n{source_text}";

const DEFAULT_DEFINITION_PLACEHOLDER =
  "You are a bilingual dictionary expert. Your task is to generate a detailed Chinese explanation for a given English word...";

const MODEL_OPTIONS = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", size: "~500MB" },
  { id: "qwen2.5-0.5b", name: "Qwen2.5 0.5B", size: "~400MB" },
  { id: "qwen2.5-1.5b", name: "Qwen2.5 1.5B", size: "~1GB" },
  { id: "qwen2.5-3b", name: "Qwen2.5 3B", size: "~2GB" },
  { id: "custom", name: "Custom URL", size: "" },
];

export function LlmProvidersTab() {
  const { t } = useTranslation();
  const { settings, updateLlm, updateLocalLlm, updatePromptTemplates } = useSettings();
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [models, setModels] = useState<LlmModelSummary[]>([]);
  const [hasLoadedModels, setHasLoadedModels] = useState(false);
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<LlamaDownloadStatus | null>(null);

  const credentialFingerprint = useMemo(
    () => `${settings.llm.baseUrl}::${settings.llm.apiKey}`,
    [settings.llm.baseUrl, settings.llm.apiKey]
  );

  useEffect(() => {
    setModels([]);
    setHasLoadedModels(false);
  }, [credentialFingerprint]);

  useEffect(() => {
    if (settings.localLlm.enabled) {
      isLlamaServerRunning().then(setIsServerRunning);
      const interval = setInterval(() => {
        isLlamaServerRunning().then(setIsServerRunning);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [settings.localLlm.enabled]);

  const canReachProvider = Boolean(settings.llm.apiKey.trim());

  const handleLoadModels = async () => {
    if (!canReachProvider) {
      toast.error(t("settings.llm.models.missing_credentials"));
      return;
    }

    setIsLoadingModels(true);
    try {
      const list = await fetchAvailableModels(settings.llm);
      setModels(list);
      setHasLoadedModels(true);

      if (
        list.length > 0 &&
        !list.some((model) => model.id === settings.llm.model.trim())
      ) {
        updateLlm({ model: list[0].id });
      }

      toast.success(
        t("settings.llm.toast.models_success", { count: list.length })
      );
    } catch (error) {
      const message =
        error instanceof LlmServiceError
          ? error.message
          : t("settings.llm.toast.models_error");
      toast.error(message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleTestConnection = async () => {
    if (!canReachProvider) {
      toast.error(t("settings.llm.models.missing_credentials"));
      return;
    }

    setIsTesting(true);
    try {
      await testLlmConnection(settings.llm);
      toast.success(t("settings.llm.toast.success"));
    } catch (error) {
      console.warn(error);
      const message =
        error instanceof LlmServiceError
          ? error.message
          : t("settings.llm.toast.error");
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDownloadLlamaCpp = async () => {
    setIsDownloading(true);
    try {
      const binaryPath = await downloadLlamaCpp((status) => {
        setDownloadStatus(status);
      });
      updateLocalLlm({ llamaCppPath: binaryPath });
      toast.success("llama.cpp downloaded successfully");
    } catch (error) {
      toast.error(`Failed to download llama.cpp: ${error}`);
    } finally {
      setIsDownloading(false);
      setDownloadStatus(null);
    }
  };

  const handleDownloadModel = async () => {
    if (!settings.localLlm.modelUrl.trim()) {
      toast.error("Please enter a model URL");
      return;
    }

    setIsDownloading(true);
    try {
      const modelDir = await getDefaultModelDir();
      const urlParts = settings.localLlm.modelUrl.split("/");
      const fileName = urlParts[urlParts.length - 1] || "model.gguf";
      const destPath = `${modelDir}/${fileName}`;

      await downloadModel(settings.localLlm.modelUrl, destPath, (status) => {
        setDownloadStatus(status);
      });
      updateLocalLlm({ modelPath: destPath });
      toast.success("Model downloaded successfully");
    } catch (error) {
      toast.error(`Failed to download model: ${error}`);
    } finally {
      setIsDownloading(false);
      setDownloadStatus(null);
    }
  };

  const handleStartServer = async () => {
    if (!settings.localLlm.llamaCppPath || !settings.localLlm.modelPath) {
      toast.error("Please configure llama.cpp path and model path first");
      return;
    }

    try {
      await startLlamaServer(
        settings.localLlm.llamaCppPath,
        settings.localLlm.modelPath,
        { nCtx: settings.localLlm.nCtx, nGpu: settings.localLlm.nGpu }
      );
      toast.success("Local LLM server started");
      setIsServerRunning(true);
    } catch (error) {
      toast.error(`Failed to start server: ${error}`);
    }
  };

  const handleStopServer = async () => {
    try {
      await stopLlamaServer();
      toast.success("Local LLM server stopped");
      setIsServerRunning(false);
    } catch (error) {
      toast.error(`Failed to stop server: ${error}`);
    }
  };

  const renderModelItems = () => {
    const items = models.map((model) => (
      <SelectItem key={model.id} value={model.id}>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{model.id}</span>
          <span className="text-xs text-muted-foreground">{model.ownedBy}</span>
        </div>
      </SelectItem>
    ));

    if (
      settings.llm.model &&
      !models.some((model) => model.id === settings.llm.model)
    ) {
      items.push(
        <SelectItem key="custom-model" value={settings.llm.model}>
          {t("settings.llm.model.custom", { model: settings.llm.model })}
        </SelectItem>
      );
    }

    return items;
  };

  const renderDownloadProgress = () => {
    if (!downloadStatus) return null;
    const percent = downloadStatus.total > 0
      ? Math.round((downloadStatus.downloaded / downloadStatus.total) * 100)
      : 0;
    return (
      <div className="mt-2">
        <p className="text-xs text-muted-foreground">
          Downloading {downloadStatus.type}... {percent}%
        </p>
        <Progress value={percent} className="mt-1" />
      </div>
    );
  };

  return (
    <div className="grid gap-6">
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
              onChange={(event) =>
                updateLlm({ baseUrl: event.target.value.trim() })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="llm-api-key">{t("settings.llm.api_key.label")}</Label>
            <Input
              id="llm-api-key"
              type="password"
              placeholder={t("settings.llm.api_key.placeholder")}
              value={settings.llm.apiKey}
              onChange={(event) => updateLlm({ apiKey: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="llm-model">{t("settings.llm.model.label")}</Label>
            <Select
              value={settings.llm.model}
              onValueChange={(value) => updateLlm({ model: value })}
              disabled={models.length === 0 && !settings.llm.model}
            >
              <SelectTrigger id="llm-model">
                <SelectValue
                  placeholder={t("settings.llm.model.placeholder")}
                />
              </SelectTrigger>
              <SelectContent>{renderModelItems()}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.llm.models.helper")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleLoadModels}
                disabled={!canReachProvider || isLoadingModels}
              >
                {isLoadingModels
                  ? t("settings.llm.models.loading")
                  : t("settings.llm.models.load")}
              </Button>
              <Button
                onClick={handleTestConnection}
                disabled={!canReachProvider || isTesting}
              >
                {isTesting
                  ? t("settings.llm.testing")
                  : t("settings.llm.test_connection")}
              </Button>
            </div>
            {hasLoadedModels && models.length === 0 && (
              <p className="text-xs text-destructive">
                {t("settings.llm.models.empty")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local Inference</CardTitle>
          <CardDescription>
            Use llama.cpp for local LLM inference. Download llama.cpp and a model to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="grid gap-1">
              <Label>Enable Local Inference</Label>
              <p className="text-xs text-muted-foreground">
                Use local model instead of cloud API
              </p>
            </div>
            <Switch
              checked={settings.localLlm.enabled}
              onCheckedChange={(checked) => updateLocalLlm({ enabled: checked })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="llama-path">llama.cpp Path</Label>
            <Input
              id="llama-path"
              placeholder="Path to llama-server executable"
              value={settings.localLlm.llamaCppPath}
              onChange={(e) => updateLocalLlm({ llamaCppPath: e.target.value })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLlamaCpp}
              disabled={isDownloading}
            >
              {isDownloading && downloadStatus?.type === "llama-cpp"
                ? "Downloading..."
                : "Download llama.cpp"}
            </Button>
          </div>

          <div className="grid gap-2">
            <Label>Select Model</Label>
            <Select
              value={settings.localLlm.modelUrl.includes("gpt-4o-mini") ? "gpt-4o-mini" : 
                     settings.localLlm.modelUrl.includes("qwen2.5-0.5b") ? "qwen2.5-0.5b" :
                     settings.localLlm.modelUrl.includes("qwen2.5-1.5b") ? "qwen2.5-1.5b" :
                     settings.localLlm.modelUrl.includes("qwen2.5-3b") ? "qwen2.5-3b" : "custom"}
              onValueChange={(value) => {
                if (value !== "custom") {
                  const modelOption = MODEL_OPTIONS.find(m => m.id === value);
                  if (modelOption) {
                    updateLocalLlm({ modelUrl: modelOption.id });
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} {model.size && `(${model.size})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model-url">Model URL</Label>
            <Input
              id="model-url"
              placeholder="https://huggingface.co/..."
              value={settings.localLlm.modelUrl}
              onChange={(e) => updateLocalLlm({ modelUrl: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model-path">Model Path</Label>
            <Input
              id="model-path"
              placeholder="Path to downloaded model file"
              value={settings.localLlm.modelPath}
              onChange={(e) => updateLocalLlm({ modelPath: e.target.value })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadModel}
              disabled={isDownloading || !settings.localLlm.modelUrl.trim()}
            >
              {isDownloading && downloadStatus?.type === "model"
                ? "Downloading..."
                : "Download Model"}
            </Button>
          </div>

          {renderDownloadProgress()}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="n-ctx">Context Size</Label>
              <Input
                id="n-ctx"
                type="number"
                min={512}
                max={128000}
                value={settings.localLlm.nCtx}
                onChange={(e) => updateLocalLlm({ nCtx: parseInt(e.target.value) || 4096 })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-gpu">GPU Layers</Label>
              <Input
                id="n-gpu"
                type="number"
                min={0}
                max={128}
                value={settings.localLlm.nGpu}
                onChange={(e) => updateLocalLlm({ nGpu: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                Set &gt; 0 to use GPU acceleration
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isServerRunning ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm">
                Server: {isServerRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartServer}
                disabled={isServerRunning || !settings.localLlm.llamaCppPath || !settings.localLlm.modelPath}
              >
                Start Server
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
        </CardContent>
      </Card>

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
            <p className="text-muted-foreground text-xs">
              {t("settings.prompts.translation_helper")}
            </p>
            <Textarea
              value={settings.promptTemplates.translation}
              onChange={(e) => updatePromptTemplates({ translation: e.target.value })}
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
            <p className="text-muted-foreground text-xs">
              {t("settings.prompts.definition_helper")}
            </p>
            <Textarea
              value={settings.promptTemplates.definition}
              onChange={(e) => updatePromptTemplates({ definition: e.target.value })}
              placeholder={DEFAULT_DEFINITION_PLACEHOLDER}
              className="min-h-[120px] font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}