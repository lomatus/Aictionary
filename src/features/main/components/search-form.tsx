import {
  FormEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAtom } from "jotai";
import { settingsAtom, updateSettingsAtom } from "@/shared/state/settings";
import { useSearchContext } from "@/shared/contexts/search-context";
import { cn } from "@/lib/utils";

export interface SearchFormRef {
  focusInput: () => void;
}

const INPUT_H = 36;
const MIN_H = INPUT_H;
const MAX_H = INPUT_H * 5;

export const SearchForm = forwardRef<SearchFormRef, Record<string, never>>(
  (_props, ref) => {
    const { t } = useTranslation();
    const [value, setValue] = useState("");
    const [showTextarea, setShowTextarea] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [settings] = useAtom(settingsAtom);
    const [, updateSettings] = useAtom(updateSettingsAtom);
    const { search, suggest, isSearching } = useSearchContext();

    useImperativeHandle(ref, () => ({
      focusInput: () => inputRef.current?.focus(),
    }));

    // Sync value to textarea when showing
    useEffect(() => {
      if (showTextarea && textareaRef.current) {
        textareaRef.current.value = value;
        const textarea = textareaRef.current;
        textarea.style.height = "auto";
        const raw = textarea.scrollHeight;
        const clamped = Math.min(Math.max(raw, MIN_H * 2), MAX_H);
        textarea.style.height = `${clamped}px`;
      }
    }, [showTextarea, value]);

    const onInputFocus = () => {
      // Check if content has multiple words (indicating multiline intent)
      if (value.includes(" ")) {
        setShowTextarea(true);
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
    };

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      suggest(newValue);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        search(value);
      }
    };

    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      search(value);
    };

    const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      suggest(newValue);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        const raw = textareaRef.current.scrollHeight;
        const clamped = Math.min(Math.max(raw, MIN_H * 2), MAX_H);
        textareaRef.current.style.height = `${clamped}px`;
      }
    };

    const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowTextarea(false);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        search(value);
      }
    };

    const onTextareaBlur = () => {
      setShowTextarea(false);
    };

    const dictType = settings.dictionary.dictType;

    const showScroll = textareaRef.current 
      ? textareaRef.current.scrollHeight > MAX_H 
      : false;

    return (
      <form onSubmit={onSubmit} className="flex flex-1 items-center gap-2">
        {/* Dict type selector — LEFT */}
        <Select
          value={dictType}
          onValueChange={(val) =>
            updateSettings({
              dictionary: { ...settings.dictionary, dictType: val },
            })
          }
        >
          <SelectTrigger 
            className="bg-transparent shrink-0 font-mono text-xs font-extrabold h-9 border-0"
            style={{ padding: "2px 2px", paddingRight: "2px" }}
          >
            <SelectValue className="text-whitesmoke font-extrabold" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">AU</SelectItem>
            <SelectItem value="en_zh">EN</SelectItem>
            <SelectItem value="zh_en">CN</SelectItem>
            <SelectItem value="en_es">ES</SelectItem>
            <SelectItem value="es_en">ES</SelectItem>
          </SelectContent>
        </Select>

        {/* Input wrapper */}
        <div className="relative flex flex-1">
          {/* Input - hidden when textarea is showing */}
          <Input
            ref={inputRef}
            value={value}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            onFocus={onInputFocus}
            placeholder={t("main.search.placeholder")}
            className={cn(
              "flex-1 transition-all duration-200",
              showTextarea ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          />

          {/* Textarea overlay - fully opaque background */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={onTextareaChange}
            onKeyDown={onTextareaKeyDown}
            onBlur={onTextareaBlur}
            className={cn(
              "absolute left-0 top-0 w-full resize-none transition-all duration-200 ease-out bg-background border border-input",
              showTextarea 
                ? "opacity-100 translate-y-0 z-10" 
                : "opacity-0 -translate-y-2 pointer-events-none",
              showScroll && "overflow-y-auto",
            )}
            style={{
              minHeight: MIN_H * 2,
              maxHeight: MAX_H,
              transition: "height 200ms ease-out, opacity 200ms ease-out, transform 200ms ease-out",
            }}
          />
        </div>

        {/* Search button */}
        <Button
          type="submit"
          disabled={isSearching}
          size="icon"
          className="shrink-0 size-9"
        >
          <Search className="size-4" />
        </Button>
      </form>
    );
  },
);