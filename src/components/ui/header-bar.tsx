import { forwardRef, useImperativeHandle, useRef } from "react";
import { X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "next-themes";
import { SmartDictInput } from "./smart-dict-input";
import type { SmartDictInputRef } from "./smart-dict-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface HeaderBarRef {
  focusInput: () => void;
  getValue: () => string;
}

interface HeaderBarProps {
  onWordLookup?: (word: string) => void;
  onTranslate?: (text: string) => void;
  disabled?: boolean;
  dictType?: string;
  onDictTypeChange?: (val: string) => void;
}

function isTauri() {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export const HeaderBar = forwardRef<HeaderBarRef, HeaderBarProps>(
  ({ onWordLookup, onTranslate, disabled = false, dictType = "auto", onDictTypeChange }, ref) => {
    const { resolvedTheme } = useTheme();
    const smartInputRef = useRef<SmartDictInputRef>(null);

    useImperativeHandle(ref, () => ({
      focusInput: () => smartInputRef.current?.focusInput(),
      getValue: () => smartInputRef.current?.getValue() ?? "",
    }), []);

    const logoSrc = resolvedTheme === "dark" ? "/logo_dark.png" : "/logo.png";
    const handleClose = () => getCurrentWindow().close();

    return (
      <>
        {isTauri() && (
          <button
            onClick={handleClose}
            className="fixed top-0 right-0 z-[160] flex h-9 w-12 items-center justify-center text-muted-foreground hover:bg-destructive/80 hover:text-destructive-foreground transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="fixed top-0 left-0 z-[150] backdrop-blur-sm">
          <div className="flex flex-col">
            <div className="flex h-[50px] items-center gap-2 pl-2 pt-2">
              <button
                type="button"
                onClick={() => { window.location.href = "/"; }}
                className="shrink-0 rounded-md p-1 hover:bg-muted/60 transition-colors"
                title="首页"
              >
                <img
                  src={logoSrc}
                  alt="Aictionary"
                  className="h-[50px] w-[50px] object-contain"
                />
              </button>

              <Select
                value={dictType}
                onValueChange={onDictTypeChange}
                disabled={disabled}
              >
                <SelectTrigger className="bg-transparent shrink-0 font-mono text-xs font-extrabold h-9 border-0 px-1 mt-2">
                  <SelectValue className="text-primary font-extrabold" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">AU</SelectItem>
                  <SelectItem value="en_zh">EN</SelectItem>
                  <SelectItem value="zh_en">CN</SelectItem>
                  <SelectItem value="en_es">ES</SelectItem>
                  <SelectItem value="es_en">ES</SelectItem>
                </SelectContent>
              </Select>

              <SmartDictInput
                ref={smartInputRef}
                onWordLookup={onWordLookup}
                onTranslate={onTranslate}
                suggestions={[]}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </>
    );
  }
);

HeaderBar.displayName = "HeaderBar";