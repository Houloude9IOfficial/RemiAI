"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquareText,
  Brain,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  CloudSun,
  Clock,
  DollarSign,
  Bitcoin,
  Newspaper,
  TrendingUp,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CARD_IDS, type CardId } from "@/lib/api/preferences";

const CARD_META: Record<
  CardId,
  { label: string; icon: typeof CloudSun; hint: string }
> = {
  weather: { label: "Weather", icon: CloudSun, hint: "Open-Meteo + Nominatim" },
  timezone: { label: "Timezone", icon: Clock, hint: "WorldTimeAPI / TimeAPI" },
  currency: { label: "Currency", icon: DollarSign, hint: "Frankfurter / ECB" },
  map: { label: "Map", icon: MapIcon, hint: "OSM / Nominatim" },
  crypto: { label: "Crypto", icon: Bitcoin, hint: "CoinGecko" },
  news: { label: "News", icon: Newspaper, hint: "Integrated news" },
  stock: { label: "Stock", icon: TrendingUp, hint: "Market data" },
};

export function OptionsSettings() {
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

  const disabled = isLoading || updateMutation.isPending;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Options</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how messages and model activity are displayed in chat.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquareText className="h-4 w-4 text-primary" />
            Messages
          </CardTitle>
          <CardDescription className="text-xs">
            Reduce visual noise in conversations without removing message
            controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <OptionRow
            title="Collapse long user messages"
            description="Fold long prompts by default. You can still expand any message when needed."
            checked={preferences?.collapseLongUserMessages ?? true}
            disabled={disabled}
            onCheckedChange={(collapseLongUserMessages) =>
              updateMutation.mutate({ collapseLongUserMessages })
            }
          />
        </CardContent>
      </Card>

      <RemiApiOptions
        preferences={preferences}
        disabled={disabled}
        onUpdate={updateMutation.mutate}
      />

      <NotificationSettings />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-primary" />
            Reasoning
          </CardTitle>
          <CardDescription className="text-xs">
            Control whether model reasoning opens automatically while work is in
            progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <OptionRow
            title="Expand reasoning while working"
            description="Open active reasoning automatically, then fold it once the final response begins."
            checked={preferences?.expandReasoningWhileWorking ?? true}
            disabled={disabled}
            onCheckedChange={(expandReasoningWhileWorking) =>
              updateMutation.mutate({ expandReasoningWhileWorking })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Conversation titles
          </CardTitle>
          <CardDescription className="text-xs">
            Choose whether Remi generates concise titles for new chats.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-4">
          <OptionRow
            title="Generate conversation titles"
            description="Replace a new chat's initial title with a descriptive title after Remi responds."
            checked={preferences?.enableTitleGeneration ?? true}
            disabled={disabled}
            onCheckedChange={(enableTitleGeneration) =>
              updateMutation.mutate({ enableTitleGeneration })
            }
          />
        </CardContent>
      </Card>

      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="flex-1">Could not load your saved options.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function RemiApiOptions({
  preferences,
  disabled,
  onUpdate,
}: {
  preferences: UserPreferences | undefined;
  disabled: boolean;
  onUpdate: (data: Partial<UserPreferences>) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(
    () => setUrl(preferences?.remiApiUrl ?? ""),
    [preferences?.remiApiUrl],
  );
  const saveUrl = () => {
    if (url !== (preferences?.remiApiUrl ?? "")) onUpdate({ remiApiUrl: url });
  };
  const cardDisplayModes = preferences?.cardDisplayModes ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <LayoutGrid className="h-4 w-4 text-primary" />
          RemiAPI &amp; Visual Cards
        </CardTitle>
        <CardDescription className="text-xs">
          Configure the zero-cost visual card set and its display style.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
          <p className="text-xs font-semibold">Enable visual cards</p>
          <Switch
            checked={preferences?.remiApiEnabled ?? true}
            disabled={disabled}
            onCheckedChange={(remiApiEnabled) => onUpdate({ remiApiEnabled })}
            aria-label="Toggle RemiAPI cards"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remiApiUrl" className="text-xs">
            RemiAPI Worker URL (optional override)
          </Label>
          <Input
            id="remiApiUrl"
            disabled={disabled}
            placeholder="https://remiapi.your-subdomain.workers.dev  (leave blank for default)"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={saveUrl}
          />
          <p className="text-[11px] text-muted-foreground/60">
            Leave blank to use the built-in default. No secrets here.
          </p>
        </div>
        <div className="space-y-2.5">
          <p className="text-xs font-semibold">Per-card display</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CARD_IDS.map((id) => {
              const meta = CARD_META[id];
              const Icon = meta.icon;
              const mode = cardDisplayModes[id] ?? "card";
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card px-2.5 py-2"
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span>{meta.label}</span>
                    <span className="hidden text-[10px] font-normal text-muted-foreground sm:inline">
                      {meta.hint}
                    </span>
                  </span>
                  <Select
                    value={mode}
                    disabled={disabled}
                    onValueChange={(value) => {
                      if (value) {
                        onUpdate({
                          cardDisplayModes: {
                            ...cardDisplayModes,
                            [id]: value,
                          },
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[88px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            Each card can render as a visual card or plain text.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
