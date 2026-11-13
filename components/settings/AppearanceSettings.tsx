"use client";

import { useEffect, useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Palette, RefreshCw, Type } from "lucide-react";
import { toast } from "sonner";
import { ACCENT_PRESETS } from "@/lib/accent-colors";
import { BACKGROUND_PRESETS } from "@/lib/background-colors";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";
import { useTheme } from "@/components/ThemeProvider";
import { useAppearancePreview } from "@/components/AppearancePreviewProvider";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  CHAT_TEXT_SIZE_STEP,
  DEFAULT_CHAT_TEXT_SIZE,
  MAX_CHAT_TEXT_SIZE,
  MIN_CHAT_TEXT_SIZE,
  chatTextSizeStyle,
} from "@/lib/chat/text-size";
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
  const [textSizeDraft, setTextSizeDraft] = useState<number | null>(null);
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
    scope: { id: "appearance-preferences" },
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: async (updatedPreferences) => {
      await queryClient.cancelQueries({ queryKey: ["preferences"] });
      queryClient.setQueryData(["preferences"], updatedPreferences);
    },
    onError: (error: Error, data) => {
      toast.error(data.chatTextSize === undefined ? error.message : "Could not save chat text size.");
    },
  });
  const accentTheme: "light" | "dark" =
    resolvedTheme === "dark" ? "dark" : "light";
  const disabled = isLoading || updateMutation.isPending;
  const accentColor = preferences?.accentColor ?? "";
  const backgroundColor = preferences?.backgroundColor ?? "";
  const savedTextSize = preferences?.chatTextSize ?? DEFAULT_CHAT_TEXT_SIZE;
  const pendingTextSize = updateMutation.isPending
    ? updateMutation.variables?.chatTextSize
    : undefined;
  const textSize = textSizeDraft ?? pendingTextSize ?? savedTextSize;

  useEffect(() => clearPreviews, [clearPreviews]);

  const selectAccent = (value: string) => {
    setAccentPreview(value);
    updateMutation.mutate({ accentColor: value });
  };
  const selectBackground = (value: string) => {
    setBackgroundPreview(value);
    updateMutation.mutate({ backgroundColor: value });
  };
  const saveTextSize = (value: number) => {
    setTextSizeDraft(null);
    if (value !== (pendingTextSize ?? savedTextSize)) {
      updateMutation.mutate({ chatTextSize: value });
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize the app&apos;s colors and chat text size.
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

      <Card>
        <CardHeader>
          <CardTitle id="chat-text-size-label" className="flex items-center gap-2 text-sm">
            <Type aria-hidden="true" className="h-4 w-4 text-primary" />
            Chat text size
          </CardTitle>
          <CardDescription className="text-xs">
            Adjust the size of messages and the composer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 border-t pt-4">
          <div className="flex items-center gap-3">
            <Slider.Root
              aria-labelledby="chat-text-size-label"
              className="min-w-0 flex-1"
              disabled={!preferences}
              min={MIN_CHAT_TEXT_SIZE}
              max={MAX_CHAT_TEXT_SIZE}
              step={CHAT_TEXT_SIZE_STEP}
              value={textSize}
              onValueChange={setTextSizeDraft}
              onValueCommitted={saveTextSize}
            >
              <Slider.Control
                className="flex h-10 touch-none items-center"
                onPointerDown={(event) => {
                  // Base UI already handles touch through its touch event listeners.
                  if (event.pointerType === "touch") event.preventBaseUIHandler();
                }}
              >
                <Slider.Track className="relative h-1.5 w-full rounded-full bg-muted-foreground/25">
                  <Slider.Indicator className="rounded-full bg-primary" />
                  <Slider.Thumb
                    getAriaValueText={(value) => `${value}%`}
                    className="block size-4 rounded-full border-2 border-primary bg-background outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                  />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <span aria-hidden="true" className="w-12 text-right text-sm tabular-nums">
              {textSize}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!preferences || textSize === DEFAULT_CHAT_TEXT_SIZE}
              onClick={() => saveTextSize(DEFAULT_CHAT_TEXT_SIZE)}
            >
              Reset
            </Button>
          </div>
          <figure className="min-w-0 rounded-xl border bg-background p-4">
            <figcaption className="mb-3 text-xs font-medium text-muted-foreground">
              Preview
            </figcaption>
            <div className="flex flex-col gap-3" style={chatTextSizeStyle(textSize)}>
              <p className="chat-user-bubble chat-user-text max-w-full self-end leading-relaxed">
                Can you help me plan my day?
              </p>
              <div className="chat-assistant-text min-w-0">
                <MarkdownRenderer content="**Start with one priority.** Then set aside time for the tasks that can wait." />
              </div>
            </div>
          </figure>
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
