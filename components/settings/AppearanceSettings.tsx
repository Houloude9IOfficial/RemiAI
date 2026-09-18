"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Palette, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ACCENT_PRESETS } from "@/lib/accent-colors";
import { BACKGROUND_PRESETS } from "@/lib/background-colors";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";
import { useTheme } from "@/components/ThemeProvider";
import { useAppearancePreview } from "@/components/AppearancePreviewProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const { resolvedTheme } = useTheme();
  const {
    setAccentPreview,
    setBackgroundPreview,
    clearPreviews,
    setAccentHover,
    clearAccentHover,
    setBackgroundHover,
    clearBackgroundHover,
  } = useAppearancePreview();
  const queryClient = useQueryClient();
  const {
    data: preferences,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });
  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: (updatedPreferences) => {
      queryClient.setQueryData(["preferences"], updatedPreferences);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const accentTheme: "light" | "dark" =
    resolvedTheme === "dark" ? "dark" : "light";
  const disabled = isLoading || updateMutation.isPending;
  const accentColor = preferences?.accentColor ?? "";
  const backgroundColor = preferences?.backgroundColor ?? "";

  useEffect(() => clearPreviews, [clearPreviews]);

  const selectAccent = (value: string) => {
    setAccentPreview(value);
    updateMutation.mutate({ accentColor: value });
  };
  const selectBackground = (value: string) => {
    setBackgroundPreview(value);
    updateMutation.mutate({ backgroundColor: value });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize the app&apos;s accent color and background palette.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Palette className="h-4 w-4 text-primary" />
            Color theme
          </CardTitle>
          <CardDescription className="text-xs">
            Changes are saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 border-t pt-4">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Accent color</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectAccent("")}
                onMouseEnter={() => setAccentHover("")}
                onMouseLeave={clearAccentHover}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border border-border transition-all duration-150 hover:scale-110 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  accentColor === "" && "ring-2 ring-foreground ring-offset-2",
                )}
                style={{
                  background:
                    accentTheme === "dark"
                      ? "oklch(0.72 0.12 252)"
                      : "oklch(0.58 0.14 252)",
                }}
                title="Default"
                aria-label="Default accent color"
              >
                {accentColor === "" && (
                  <Check
                    className={cn(
                      "h-4 w-4",
                      accentTheme === "dark" ? "text-foreground" : "text-white",
                    )}
                  />
                )}
              </button>
              {ACCENT_PRESETS.map((preset) => {
                const selected = accentColor === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectAccent(preset.id)}
                    onMouseEnter={() => setAccentHover(preset.id)}
                    onMouseLeave={clearAccentHover}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border border-border/40 transition-all duration-150 hover:scale-110 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                      selected && "ring-2 ring-foreground ring-offset-2",
                    )}
                    style={{
                      backgroundColor:
                        accentTheme === "dark" ? preset.dark : preset.light,
                    }}
                    title={preset.label}
                    aria-label={`${preset.label} accent color`}
                  >
                    {selected && (
                      <Check
                        className={cn(
                          "h-4 w-4",
                          accentTheme === "dark"
                            ? "text-foreground"
                            : "text-white",
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Used for buttons, highlights, and focus rings.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Background</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectBackground("")}
                onMouseEnter={() => setBackgroundHover("")}
                onMouseLeave={clearBackgroundHover}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  backgroundColor === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:border-foreground/40 hover:bg-accent/40",
                )}
                aria-pressed={backgroundColor === ""}
              >
                Default
              </button>
              {BACKGROUND_PRESETS.map((preset) => {
                const selected = backgroundColor === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectBackground(preset.id)}
                    onMouseEnter={() => setBackgroundHover(preset.id)}
                    onMouseLeave={clearBackgroundHover}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:border-foreground/40 hover:bg-accent/40",
                    )}
                    aria-pressed={selected}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              The canvas, cards, and sidebar palette.
            </p>
          </div>
        </CardContent>
      </Card>

      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="flex-1">
            Could not load your saved appearance settings.
          </span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
