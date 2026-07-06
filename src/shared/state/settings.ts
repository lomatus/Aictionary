import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { AppSettings } from "@/shared/types/settings";

const DEFAULT_TRANSLATION_TEMPLATE = `Translate the following text into {target_lang}. Note that you should only output the translated result without any additional explanation:

{source_text}`;

const DEFAULT_DEFINITION_TEMPLATE = `You are a bilingual dictionary expert. Your task is to generate a detailed Chinese explanation for a given English word and its synonyms, outputting in strict JSON format.

When quotes are needed inside JSON values, use Chinese double quotes (" "). Ensure all fields have complete values and do not omit or leave any fields empty.

Please follow the structure and depth of the examples below exactly.`;

export const defaultSettings: AppSettings = {
  theme: {
    mode: "system",
    accent: "blue",
  },
  language: "en",
  llm: {
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
  },
  localLlm: {
    enabled: false,
    binaryPath: "",
    modelPath: "",
    serverPort: 0,
  },
  audio: {
    apiKey: "",
    model: "s1",
    voiceId: "",
  },
  anki: {
    apiUrl: "http://127.0.0.1:8765",
    deckName: "AIctionary",
    cardTheme: "light",
  },
  dictionary: {
    cachePath: "",
    lastUpdated: null,
    dictType: "auto",
  },
  keyboard: {
    quickQuery: "Alt+Q",
    newQuery: "Alt+W",
    enabled: true,
  },
  about: {
    version: "2.2.0",
    build: "production",
  },
  system: {
    trayIconEnabled: true,
    launchOnSystemStart: false,
    dockOrTaskbarVisible: true,
  },
  glossary: [],
  promptTemplates: {
    translation: DEFAULT_TRANSLATION_TEMPLATE,
    definition: DEFAULT_DEFINITION_TEMPLATE,
  },
};

export const settingsAtom = atomWithStorage<AppSettings>(
  "aictionary-settings",
  defaultSettings
);

export const updateSettingsAtom = atom(
  null,
  (get, set, update: Partial<AppSettings>) => {
    set(settingsAtom, { ...get(settingsAtom), ...update });
  }
);
