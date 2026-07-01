import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/features/settings/hooks/use-settings";
import type { GlossaryEntry } from "@/shared/types/settings";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function GlossaryRow({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: GlossaryEntry;
  onUpdate: (updated: GlossaryEntry) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-2 rounded border p-2">
      <div className="grid gap-1">
        <Label className="text-xs">{("settings.glossary.source")}</Label>
        <Input
          value={entry.source}
          onChange={(e) => onUpdate({ ...entry, source: e.target.value })}
          placeholder="e.g. LLM"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{("settings.glossary.target")}</Label>
        <Input
          value={entry.target}
          onChange={(e) => onUpdate({ ...entry, target: e.target.value })}
          placeholder="e.g. 大语言模型"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{("settings.glossary.notes")}</Label>
        <Input
          value={entry.notes}
          onChange={(e) => onUpdate({ ...entry, notes: e.target.value })}
          placeholder={("settings.glossary.notes_placeholder")}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="mt-5 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function GlossaryTab() {
  const { t } = useTranslation();
  const { settings, updateGlossary } = useSettings();
  const [isExpanded, setIsExpanded] = useState(true);

  const entries = settings.glossary;

  const addEntry = () => {
    const newEntry: GlossaryEntry = {
      id: generateId(),
      source: "",
      target: "",
      notes: "",
      category: "",
    };
    updateGlossary([...entries, newEntry]);
  };

  const updateEntry = (updated: GlossaryEntry) => {
    updateGlossary(
      entries.map((e) => (e.id === updated.id ? updated : e))
    );
  };

  const deleteEntry = (id: string) => {
    updateGlossary(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <div>
              <CardTitle>{t("settings.glossary.title")}</CardTitle>
              <CardDescription>{t("settings.glossary.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="grid gap-4">
            <p className="text-muted-foreground text-xs">
              {t("settings.glossary.helper")}
            </p>

            {entries.length > 0 && (
              <div className="grid gap-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-2">
                  <Label className="text-xs">{t("settings.glossary.source")}</Label>
                  <Label className="text-xs">{t("settings.glossary.target")}</Label>
                  <Label className="text-xs">{t("settings.glossary.notes")}</Label>
                  <div />
                </div>
                {entries.map((entry) => (
                  <GlossaryRow
                    key={entry.id}
                    entry={entry}
                    onUpdate={updateEntry}
                    onDelete={() => deleteEntry(entry.id)}
                  />
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={addEntry} className="w-fit">
              <Plus className="mr-1.5 size-3.5" />
              {t("settings.glossary.add")}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}