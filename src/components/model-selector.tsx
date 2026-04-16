"use client";

import { ALL_MODELS, PROVIDERS, findModel, buildModelKey, type LLMModel } from "@/lib/nvidia";
import { cn } from "@/lib/utils";
import { Cpu, Zap, ChevronDown, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

interface ModelSelectorProps {
  value: string; // "provider:modelId"
  onChange: (value: string) => void;
  disabled?: boolean;
}

function ModelItem({ model, isSelected, isAvailable, onSelect }: {
  model: LLMModel;
  isSelected: boolean;
  isAvailable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={() => isAvailable && onSelect()}
      disabled={!isAvailable}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
        isSelected
          ? "bg-primary/10 ring-1 ring-primary/30"
          : isAvailable
            ? "hover:bg-accent"
            : "opacity-40 cursor-not-allowed"
      )}
    >
      {/* Speed icon */}
      <div className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
        model.speed === "fast" ? "bg-amber-500/10" : "bg-muted"
      )}>
        {model.speed === "fast" ? (
          <Zap className="h-4 w-4 text-amber-500" />
        ) : (
          <Cpu className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Model info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-medium leading-tight",
            isSelected ? "text-primary" : "text-foreground"
          )}>
            {model.name}
          </span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {model.contextLength}
          </span>
        </div>
        <p className={cn(
          "mt-0.5 text-xs leading-relaxed line-clamp-1",
          isSelected ? "text-primary/70" : "text-muted-foreground"
        )}>
          {model.description}
        </p>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
    </button>
  );
}

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providerStatus, setProviderStatus] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = findModel(value);

  // Fetch provider availability on mount
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        const status: Record<string, boolean> = {};
        if (data?.providers) {
          for (const [key, val] of Object.entries(data.providers)) {
            status[key] = (val as { available: boolean }).available;
          }
        }
        setProviderStatus(status);
      })
      .catch(() => {
        setProviderStatus({ groq: true, nvidia: true });
      });
  }, []);

  // Close on outside click / Escape
  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, handleClose]);

  const availableProviders = PROVIDERS.filter((provider) => {
    const models = ALL_MODELS.filter((m) => m.provider === provider.id);
    return models.length > 0;
  });

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent/60 hover:border-border",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        disabled={disabled}
      >
        {currentModel ? (
          <>
            <span className="text-base leading-none">
              {PROVIDERS.find((p) => p.id === currentModel.provider)?.icon}
            </span>
            <span className="max-w-[160px] truncate font-medium text-foreground">
              {currentModel.name}
            </span>
            {providerStatus[currentModel.provider] === false && (
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">选择模型</span>
          </>
        )}
        <ChevronDown className={cn(
          "h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200",
          open && "rotate-180"
        )} />
      </button>

      {/* Dropdown overlay + panel */}
      {open && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/20 sm:hidden"
            onClick={handleClose}
          />

          {/* Dropdown panel */}
          <div
            ref={dropdownRef}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-hidden rounded-t-2xl border border-border/50 bg-popover shadow-2xl animate-in slide-in-from-bottom duration-200 sm:fixed sm:inset-auto sm:right-0 sm:bottom-auto sm:left-auto sm:top-full sm:mt-2 sm:w-[380px] sm:max-h-[70vh] sm:rounded-xl sm:slide-in-from-top-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">选择模型</h3>
              </div>
              <button
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Model list */}
            <div className="overflow-y-auto overscroll-contain p-2" style={{ maxHeight: "calc(80vh - 56px)" }}>
              {availableProviders.map((provider) => {
                const models = ALL_MODELS.filter((m) => m.provider === provider.id);
                const isAvailable = providerStatus[provider.id] !== false;

                return (
                  <div key={provider.id} className="mb-1">
                    {/* Provider section header */}
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
                      <span className="text-base leading-none">{provider.icon}</span>
                      <span className="text-sm font-semibold text-foreground">
                        {provider.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {provider.description}
                      </span>
                      <span className="ml-auto">
                        {isAvailable ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            已配置
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            未配置
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Model items */}
                    <div className="space-y-0.5">
                      {models.map((model) => {
                        const key = buildModelKey(model.provider, model.id);
                        const isSelected = value === key;
                        const modelAvailable = providerStatus[model.provider] !== false;
                        return (
                          <ModelItem
                            key={key}
                            model={model}
                            isSelected={isSelected}
                            isAvailable={modelAvailable}
                            onSelect={() => {
                              onChange(key);
                              setOpen(false);
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Unavailable hint */}
                    {!isAvailable && (
                      <div className="mx-2 mb-2 mt-1 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          ⚠ 请配置环境变量 <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[11px]">{provider.id.toUpperCase()}_API_KEY</code> 后使用
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
