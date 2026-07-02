export type ThemePreference = {
  mode: "system" | "light" | "dark";
  accent: "blue" | "purple" | "green" | "orange" | "rose";
};

export type LanguagePreference = "en" | "zh";

export type LlmProvider = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type LocalLlmSettings = {
  enabled: boolean;
  llamaCppPath: string; // Path to llama.cpp binary
  modelPath: string; // Path to model file
  modelUrl: string; // Download URL for the model
  nCtx: number; // Context size
  nGpu: number; // GPU layers (0 = CPU only)
  isDownloading: boolean;
  downloadProgress: number;
};

export type AudioSettings = {
  apiKey: string;
  model: string;
  voiceId: string;
};

export type AnkiSettings = {
  apiUrl: string;
  deckName: string;
  cardTheme: "light" | "dark";
};

export type LanguagePair = {
  id: string;
  source_lang: string;
  target_lang: string;
  name: string;
  name_en: string;
  spellcheck: boolean;
  enabled: boolean;
};

export type DictionarySettings = {
  cachePath: string;
  lastUpdated: string | null;
  dictType: string; // e.g. "en_zh", "zh_en", "auto"
};

export type KeyboardShortcutSettings = {
  quickQuery: string;
  newQuery: string;
  enabled: boolean;
};

export type GlossaryEntry = {
  id: string;
  source: string;
  target: string;
  notes: string;
  category: string;
};

export type PromptTemplateSettings = {
  translation: string;
  definition: string;
};

export type AboutMetadata = {
  version: string;
  build: string;
};

export type SystemSettings = {
  trayIconEnabled: boolean;
  launchOnSystemStart: boolean;
  dockOrTaskbarVisible: boolean;
};

export type AppSettings = {
  theme: ThemePreference;
  language: LanguagePreference;
  llm: LlmProvider;
  localLlm: LocalLlmSettings;
  audio: AudioSettings;
  anki: AnkiSettings;
  dictionary: DictionarySettings;
  keyboard: KeyboardShortcutSettings;
  about: AboutMetadata;
  system: SystemSettings;
  glossary: GlossaryEntry[];
  promptTemplates: PromptTemplateSettings;
};