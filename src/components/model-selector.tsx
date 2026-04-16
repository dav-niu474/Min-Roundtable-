"use client";

import { ALL_MODELS, PROVIDERS, findModel, buildModelKey, type LLMProvider } from "@/lib/nvidia";
import { cn } from "@/lib/utils";
import { Cpu, Zap, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ModelSelectorProps {
  value: string; // "provider:modelId"
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providerStatus, setProviderStatus] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

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
        // If fetch fails, assume all available (fallback)
        setProviderStatus({ groq: true, nvidia: true });
      });
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Filter to only show providers that have models and are available
  const availableProviders = PROVIDERS.filter((provider) => {
    const models = ALL_MODELS.filter((m) => m.provider === provider.id);
    if (models.length === 0) return false;
    // Always show provider, but mark as unavailable if no API key
    return true;
  });

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1 text-xs transition-colors hover:bg-accent/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        disabled={disabled}
      >
        {currentModel ? (
          <>
            <span className="text-muted-foreground">
              {PROVIDERS.find((p) => p.id === currentModel.provider)?.icon}
            </span>
            <span className="max-w-[140px] truncate font-medium text-foreground">
              {currentModel.name}
            </span>
            {providerStatus[currentModel.provider] === false && (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
          </>
        ) : (
          <>
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">选择模型</span>
          </>
        )}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2">
          <div className="max-h-[400px] overflow-y-auto p-1.5">
            {availableProviders.map((provider) => {
              const models = ALL_MODELS.filter((m) => m.provider === provider.id);
              const isAvailable = providerStatus[provider.id] !== false;

              return (
                <div key={provider.id}>
                  {/* Provider header */}
                  <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
                    <span className="text-sm">{provider.icon}</span>
                    <span className="text-xs font-semibold text-foreground">
                      {provider.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {provider.description}
                    </span>
                    {isAvailable ? (
                      <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-500" />
                    ) : (
                      <span title="未配置 API Key">
                        <AlertTriangle className="ml-auto h-3 w-3 text-amber-500" />
                      </span>
                    )}
                  </div>

                  {/* Models */}
                  <div className="space-y-0.5 pb-1">
                    {models.map((model) => {
                      const key = buildModelKey(model.provider, model.id);
                      const isSelected = value === key;
                      const modelAvailable = providerStatus[model.provider] !== false;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            if (modelAvailable) {
                              onChange(key);
                              setOpen(false);
                            }
                          }}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : modelAvailable
                                ? "hover:bg-accent/50"
                                : "opacity-50 cursor-not-allowed"
                          )}
                          disabled={!modelAvailable}
                          title={!modelAvailable ? `${provider.name} 未配置 API Key，请设置 ${provider.id.toUpperCase()}_API_KEY 环境变量` : undefined}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {model.speed === "fast" ? (
                              <Zap className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium">{model.name}</span>
                              <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
                                {model.contextLength}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-1">
                              {model.description}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                          )}
                        </button>
                      );
                    })}
                    {!isAvailable && (
                      <p className="px-2.5 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                        ⚠ 请在环境变量中配置 {provider.id.toUpperCase()}_API_KEY
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
