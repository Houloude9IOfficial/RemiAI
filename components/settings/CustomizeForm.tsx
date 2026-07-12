"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PREFERENCES: UserPreferences = {
  preferredName: "",
  preferences: "",
  personality: "Be helpful, concise, and direct. Match the user's tone.",
};

export function CustomizeForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      toast.success("Preferences saved");
    },
    onError: () => {
      toast.error("Failed to save preferences");
    },
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const hasChanges =
    form.preferredName !== (data?.preferredName ?? "") ||
    form.preferences !== (data?.preferences ?? "") ||
    form.personality !== (data?.personality ?? "");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Customize</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell your AI how to call you, what you like, and how you&apos;d like
          it to behave. These preferences will be added to every conversation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Persona
          </CardTitle>
          <CardDescription className="text-xs">
            How Remi should address and interact with you — your name, interests, and the
            assistant&apos;s tone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Preferred Name */}
          <div className="space-y-2">
            <Label htmlFor="preferredName">Preferred Name</Label>
            <Input
              id="preferredName"
              placeholder="e.g. Alex, Dr. Chen, Captain..."
              value={form.preferredName}
              onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Your AI will call you by this name in conversations.
            </p>
          </div>

          {/* Preferences / Likings */}
          <div className="space-y-2">
            <Label htmlFor="preferences">Preferences</Label>
            <Textarea
              id="preferences"
              placeholder="e.g. I prefer concise answers, I'm a software engineer, I like Python..."
              value={form.preferences}
              onChange={(e) => setForm({ ...form, preferences: e.target.value })}
              className="min-h-[80px] resize-y"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Things your AI should know about you. (your interests, profession, communication style, etc.)
            </p>
          </div>

          {/* Personality */}
          <div className="space-y-2">
            <Label htmlFor="personality">Personality</Label>
            <Textarea
              id="personality"
              placeholder="e.g. Be warm and encouraging, use emojis, speak like a friend..."
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
              className="min-h-[80px] resize-y"
            />
            <p className="text-[11px] text-muted-foreground/60">
              How you want the AI to behave. (tone, style, level of formality, etc.)
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
            className="w-full gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {updateMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
