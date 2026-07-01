import { FormEvent, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const BTN_H = 36;
const MIN_H = BTN_H;
const MAX_H = BTN_H * 5;

export const SearchForm = forwardRef<SearchFormRef, Record<string, never>>(
  (_props, ref) => {
    const { t } = useTranslation();
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [settings] = useAtom(settingsAtom);

    useImperativeHandle(ref, () => ({
      focusInput: () => textareaRef.current?.focus(),
    }));

    const resize = (el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      const raw = el.scrollHeight;
      const clamped = Math.min(Math.max(raw, MIN_H), MAX_H);
      el.style.height = `${clamped}px`;
      setIsExpanded(raw > MIN_H);
    };

    const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      resize(e.target);
      suggest(e.target.value);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        search(value);
      }
    };

    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      search(value);
    };

    const onFocus = () => {
      setIsFocused(true);
      if (textareaRef.current) resize(textareaRef.current);
    };
    const onBlur = () => {
      setIsFocused(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_H}px`;
        setIsExpanded(false);
      }
    };

    const dictType = settings.dictionary.dictType;

    const showScroll =
      isFocused && isExpanded && textareaRef.current
        ? textareaRef.current.scrollHeight > MAX_H
        : false;

    return (
      <form
        onSubmit={onSubmit}
        className="flex flex-1 items-center gap-2"
      >
        {/* Dict type selector — LEFT, accent bg */}
        <Select
          value={dictType}
          onValueChange={(val) =>
            updateSettings({
              dictionary: { ...settings.dictionary, dictType: val },
            })
          }
        >
          <SelectTrigger className="bg-primary text-primary-foreground border-primary w-[52px] shrink-0 font-mono text-xs font-bold h-[36px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">AU</SelectItem>
            <SelectItem value="en_zh">EN</SelectItem>
            <SelectItem value="zh_en">CN</SelectItem>
            <SelectItem value="en_es">ES</SelectItem>
            <SelectItem value="es_en">ES</SelectItem>
          </SelectContent>
        </Select>

        {/* Shell: fixed-height flex-col */}
        <div 
          className="relative flex flex-1 flex-col overflow-hidden"
          style={{ height: MIN_H }}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={t("main.search.placeholder")}
            rows={1}
            className={cn(
              "resize-none text-base shadow-none focus-visible:ring-0",
              "flex-1 min-h-0 py-2 px-2",
              "border border-transparent",
              isFocused && "border-primary",
              isFocused && isExpanded && showScroll && "overflow-y-auto",
              isFocused && isExpanded && !showScroll && "overflow-hidden",
              !isFocused && "overflow-hidden",
            )}
            style={{
              height: isFocused ? undefined : "100%",
              transition: "border-color 150ms ease",
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
  }
);
