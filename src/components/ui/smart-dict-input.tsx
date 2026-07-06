import {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SmartDictInputRef {
  focusInput: () => void;
  getValue: () => string;
}

interface SmartDictInputProps {
  onWordLookup?: (word: string) => void;
  onTranslate?: (text: string) => void;
  onSuggest?: (word: string) => Promise<string[]>;
  onFocus?: () => void;
  suggestions?: string[];
  disabled?: boolean;
  maxHeight?: number;
}

const SINGLE_LINE_MAX_CHARS = 20;
const SINGLE_LINE_HEIGHT = 44;

export const SmartDictInput = forwardRef<SmartDictInputRef, SmartDictInputProps>(
  (
    {
      onWordLookup,
      onTranslate,
      onSuggest,
      onFocus,
      suggestions = [],
      disabled = false,
      maxHeight = 240,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [value, setValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    useImperativeHandle(ref, () => ({
      focusInput: () => textareaRef.current?.focus(),
      getValue: () => textareaRef.current?.value ?? "",
    }), []);

    const isMultiLine = useCallback(
      (text: string) => /\s/.test(text) || text.length > SINGLE_LINE_MAX_CHARS,
      [],
    );

    useEffect(() => {
      setSelectedIndex(-1);
    }, [localSuggestions]);

    useEffect(() => {
      if (isFocused && isMultiLine(value)) {
        setIsExpanded(true);
      } else if (!isMultiLine(value)) {
        setIsExpanded(false);
      }
    }, [value, isFocused, isMultiLine]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      const newValue = e.target.value;
      setValue(newValue);
      setSelectedIndex(-1);
      if (newValue.trim().length >= 2) {
        onSuggest?.(newValue).then((words) => {
          setLocalSuggestions(words);
        }).catch(() => {
          setLocalSuggestions([]);
        });
      } else {
        setLocalSuggestions([]);
      }
    };

    const handleFocus = () => {
      if (disabled) return;
      setIsFocused(true);
      if (isMultiLine(value)) setIsExpanded(true);
      onFocus?.();
    };

    const handleBlur = () => {
      setIsFocused(false);
      setIsExpanded(false);
      if (value.trim() && !isMultiLine(value)) {
        onWordLookup?.(value.trim());
      }
    };

    const handleClear = () => {
      setValue("");
      setIsExpanded(false);
      setLocalSuggestions([]);
      setSelectedIndex(-1);
      textareaRef.current?.focus();
    };

    const selectSuggestion = useCallback(
      (word: string) => {
        setValue(word);
        setLocalSuggestions([]);
        setSelectedIndex(-1);
        onWordLookup?.(word);
      },
      [onWordLookup],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const displaySuggestions = suggestions.length > 0 ? suggestions : localSuggestions;

      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && displaySuggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (e.key === "ArrowDown") {
            return prev < displaySuggestions.length - 1 ? prev + 1 : 0;
          } else {
            return prev > 0 ? prev - 1 : displaySuggestions.length - 1;
          }
        });
        return;
      }

      if (e.key === "Enter") {
        if (selectedIndex >= 0 && displaySuggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(displaySuggestions[selectedIndex]);
          return;
        }

        if (!isExpanded) {
          e.preventDefault();
          onWordLookup?.(value.trim());
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (value.trim()) onTranslate?.(value.trim());
        } else {
          e.preventDefault();
          const target = e.target as HTMLTextAreaElement;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const newValue = value.substring(0, start) + "\n" + value.substring(end);
          setValue(newValue);
          requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = start + 1;
          });
        }
      }

      if (e.key === "Escape" && displaySuggestions.length > 0) {
        e.preventDefault();
        setLocalSuggestions([]);
        setSelectedIndex(-1);
      }
    };

    const showClear = value.length > 0 && !disabled;
    const showTranslate = isExpanded && isFocused && value.trim().length > 0;
    const displaySuggestions = suggestions.length > 0 ? suggestions : localSuggestions;
    const showSuggestions =
      !isExpanded && isFocused && displaySuggestions.length > 0 && !disabled;
    const hasContent = value.trim().length > 0;

    const si = (key: string) => t(`main.search.smart_input.${key}`);

    return (
      <div className="fixed top-0 left-32 right-[150px] z-[200] border-b border-border/20 backdrop-blur-md py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="relative flex flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={si("placeholder")}
              rows={1}
              disabled={disabled}
              className={cn(
                "w-full resize-none rounded-md border border-input bg-background px-4 py-2.5 pr-20 text-sm",
                "transition-all duration-300 ease-in-out",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
                isExpanded && isFocused
                  ? "min-h-[180px]"
                  : "h-11 max-h-11",
                !isFocused && isExpanded && "truncate",
                disabled && "opacity-50 cursor-not-allowed",
              )}
              style={{
                maxHeight:
                  isExpanded && isFocused
                    ? `${maxHeight}px`
                    : `${SINGLE_LINE_HEIGHT}px`,
                overflowY: isExpanded && isFocused ? "auto" : "hidden",
              }}
            />

            {/* Right-side action buttons */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  "transition-all duration-200",
                  "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  "disabled:opacity-40 disabled:pointer-events-none",
                  showClear
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-90 pointer-events-none",
                )}
                aria-label={si("clear")}
              >
                <X className="h-4 w-4" />
              </button>

              {showTranslate && (
                <button
                  type="button"
                  onClick={() => onTranslate?.(value.trim())}
                  disabled={!hasContent || disabled}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    "text-muted-foreground transition-all",
                    "hover:bg-primary/10 hover:text-primary",
                    "disabled:opacity-40 disabled:pointer-events-none",
                  )}
                  aria-label={si("translate")}
                  title={si("translate_title")}
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Word suggestions dropdown */}
            {showSuggestions && (
              <div
                className={cn(
                  "absolute top-full left-0 right-0 mt-2 z-50",
                  "rounded-xl border bg-popover p-1 shadow-md",
                  "animate-in fade-in slide-in-from-top-2 duration-200",
                )}
              >
                {displaySuggestions.map((word, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(word);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-center rounded-lg px-3 py-2 text-sm text-left",
                      "transition-colors",
                      idx === selectedIndex
                        ? "bg-primary/20 text-primary font-medium"
                        : "hover:bg-muted",
                    )}
                  >
                    {word}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mode hint */}
        <div className="mx-auto flex max-w-3xl justify-between px-2 mt-1 text-[11px] text-muted-foreground">
          <span>{isExpanded ? si("mode_translate") : si("mode_word")}</span>
          <span>
            {isExpanded
              ? si("hint_translate")
              : showSuggestions
                ? si("hint_suggestion")
                : si("hint_word")}
          </span>
        </div>
      </div>
    );
  },
);

SmartDictInput.displayName = "SmartDictInput";
