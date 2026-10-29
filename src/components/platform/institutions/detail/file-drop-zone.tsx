"use client";

import { useRef, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileDropZoneProps = {
  /** Current raw text value (controlled by parent). */
  rawText: string;
  /** File name of the currently loaded file, if any. */
  sourceFileName: string | undefined;
  /** Called when a file is selected or dropped. Parent owns all state resets. */
  onFile: (file: File) => Promise<void>;
  /** True while the parent is reading a file asynchronously. */
  isReadingFile: boolean;
  /** Controlled by parent so handleReset / processFile can reset it. */
  isPasteMode: boolean;
  onPasteModeChange: (value: boolean) => void;
  /** Called when the paste textarea changes. Parent handles all related state resets. */
  onRawTextChange: (text: string) => void;
  /** True while a commit run is active — the workbook cannot change mid-run (Phase 5A already
   * no-ops the underlying handlers defensively; this disables the controls visibly too). */
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileDropZone({
  rawText,
  sourceFileName,
  onFile,
  isReadingFile,
  isPasteMode,
  onPasteModeChange,
  onRawTextChange,
  disabled = false,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelection(file: File) {
    if (disabled) return;
    await onFile(file);
  }

  if (!isPasteMode) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          disabled && "pointer-events-none opacity-60",
          isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-border/80",
        )}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          if (disabled) return;
          setIsDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) await handleFileSelection(file);
        }}
        aria-label={
          isReadingFile ? "Reading file…" : "Drop zone — drag and drop an Excel or CSV file here"
        }
        aria-busy={isReadingFile}
      >
        {isReadingFile ? (
          <Loader2 className="text-muted-foreground mb-3 size-8 animate-spin" aria-hidden="true" />
        ) : (
          <CloudUpload className="text-muted-foreground mb-3 size-8" aria-hidden="true" />
        )}
        {isReadingFile ? (
          <p className="text-muted-foreground mb-3 text-sm">Reading file…</p>
        ) : sourceFileName ? (
          <p className="mb-3 max-w-xs truncate text-sm font-medium" title={sourceFileName}>
            {sourceFileName}
          </p>
        ) : (
          <p className="text-muted-foreground mb-3 text-sm">Drop an Excel or CSV file here</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isReadingFile || disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Select Excel File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          className="sr-only"
          aria-label="Upload file"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file) void handleFileSelection(file);
          }}
        />
        <button
          type="button"
          className="text-muted-foreground mt-3 text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={() => onPasteModeChange(true)}
        >
          or paste text instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="historical-import-data" className="text-xs">
          Paste Excel / CSV Data
        </Label>
        <button
          type="button"
          className="text-muted-foreground text-xs underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={() => onPasteModeChange(false)}
        >
          upload file instead
        </button>
      </div>
      <Textarea
        id="historical-import-data"
        value={rawText}
        onChange={(e) => onRawTextChange(e.target.value)}
        className="min-h-48 font-mono text-xs"
        placeholder="Paste copied rows from legacy Excel export here…"
        disabled={disabled}
      />
    </div>
  );
}
