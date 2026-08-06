"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { preferencesApi, type UserPreferences } from "@/lib/api/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/date-picker/date-picker";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Loader2,
  Save,
  Sparkles,
  User,
  Camera,
  Trash2,
  Globe,
  Code2,
  MessageCircle,
  Link,
  MapPin,
  Briefcase,
  Cake,
  Hash,
  Heart,
  Medal,
  Plus,
  X,
  Palette,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS } from "@/lib/accent-colors";
import { useTheme } from "@/components/ThemeProvider";

const DEFAULT_PREFERENCES: UserPreferences = {
  preferredName: "",
  preferences: "",
  personality: "Be helpful, concise, and direct. Match the user's tone.",
  avatarUrl: "",
  bio: "",
  location: "",
  occupation: "",
  interests: "",
  skills: "",
  pronouns: "",
  birthday: "",
  links: {},
  accentColor: "",
};

interface LinkEntry {
  key: string;
  value: string;
}

const LINK_PRESETS = [    { key: "github", label: "GitHub", icon: Code2, placeholder: "https://github.com/username" },
  { key: "twitter", label: "Twitter / X", icon: MessageCircle, placeholder: "https://x.com/username" },
  { key: "website", label: "Website", icon: Globe, placeholder: "https://example.com" },
  { key: "linkedin", label: "LinkedIn", icon: Link, placeholder: "https://linkedin.com/in/username" },
];

export function ProfileForm() {
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();
  const accentTheme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";
  const [form, setForm] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const [customLinkKey, setCustomLinkKey] = useState("");
  const [customLinkValue, setCustomLinkValue] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  useEffect(() => {
    if (data) {
      setForm(data);
      // Convert links object to array for editing
      const linkEntries: LinkEntry[] = Object.entries(data.links || {}).map(
        ([key, value]) => ({ key, value }),
      );
      setLinks(linkEntries);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      toast.success("Profile saved");
    },
    onError: () => {
      toast.error("Failed to save profile");
    },
  });

  const handleSave = () => {
    // Convert links array back to object
    const linksObject: Record<string, string> = {};
    links.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        linksObject[key.trim()] = value.trim();
      }
    });

    updateMutation.mutate({ ...form, links: linksObject });
  };

  const hasChanges =
    form.preferredName !== (data?.preferredName ?? "") ||
    form.preferences !== (data?.preferences ?? "") ||
    form.personality !== (data?.personality ?? "") ||
    form.avatarUrl !== (data?.avatarUrl ?? "") ||
    form.bio !== (data?.bio ?? "") ||
    form.location !== (data?.location ?? "") ||
    form.occupation !== (data?.occupation ?? "") ||
    form.interests !== (data?.interests ?? "") ||
    form.skills !== (data?.skills ?? "") ||
    form.pronouns !== (data?.pronouns ?? "") ||
    form.birthday !== (data?.birthday ?? "") ||
    form.accentColor !== (data?.accentColor ?? "") ||
    JSON.stringify(links) !==
      JSON.stringify(Object.entries(data?.links || {}).map(([k, v]) => ({ key: k, value: v })));

  // ── Avatar handling ──────────────────────────────────────────────

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) {
      toast.error("Please upload a JPEG, PNG, WebP, or AVIF image.");
      return;
    }

    // Validate file size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const { url } = await res.json();
      setForm((prev) => ({ ...prev, avatarUrl: url }));

      // Immediately persist the avatar URL so the user doesn't need
      // to click "Save Profile" separately for the picture to show.
      // We don't invalidate the query here because that would reset
      // any other unsaved form changes the user may have made.
      await preferencesApi.update({ avatarUrl: url });

      toast.success("Profile picture saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to upload profile picture");
    } finally {
      setAvatarUploading(false);
      // Reset file input so re-selecting the same file works
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!form.avatarUrl) return;

    try {
      await fetch("/api/profile/avatar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.avatarUrl }),
      });
    } catch {
      // Ignore delete errors — the file may not exist on disk
    }

    setForm((prev) => ({ ...prev, avatarUrl: "" }));

    // Immediately persist the removal
    try {
      await preferencesApi.update({ avatarUrl: "" });
    } catch {
      // Best-effort — file may already have been removed
    }

    toast.success("Profile picture removed");
  };

  // ── Social links ──────────────────────────────────────────────────

  const addLink = (key: string, value: string) => {
    if (!key.trim() || !value.trim()) return;
    // Remove existing entry with same key
    const filtered = links.filter((l) => l.key !== key.trim());
    setLinks([...filtered, { key: key.trim(), value: value.trim() }]);
  };

  const removeLink = (key: string) => {
    setLinks(links.filter((l) => l.key !== key));
  };

  const updateLink = (key: string, newValue: string) => {
    setLinks(links.map((l) => (l.key === key ? { ...l, value: newValue } : l)));
  };

  // ── Loading state ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal details, social links, and AI preferences. Remi uses
          this information to personalise every conversation.
        </p>
      </div>

      {/* Profile Picture Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4 text-primary" />
            Profile Picture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <User className="h-8 w-8" />
                </div>
              )}
              {avatarUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={avatarUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {form.avatarUrl ? "Change" : "Upload"}
                </Button>
                {form.avatarUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={handleRemoveAvatar}
                    disabled={avatarUploading}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                JPEG, PNG, WebP, or AVIF. Max 5 MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Palette className="h-4 w-4 text-primary" />
            Accent Color
          </CardTitle>
          <CardDescription className="text-xs">
            Pick the accent color used across the app — buttons, highlights,
            focus rings, and the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Default */}
            <button
              type="button"
              onClick={() => setForm({ ...form, accentColor: "" })}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-border transition-all duration-150 hover:scale-110 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                form.accentColor === "" && "ring-2 ring-foreground ring-offset-2",
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
              {form.accentColor === "" && (
                <Check
                  className={cn(
                    "h-4 w-4",
                    accentTheme === "dark" ? "text-foreground" : "text-white",
                  )}
                />
              )}
            </button>

            {/* Presets */}
            {ACCENT_PRESETS.map((preset) => {
              const selected = form.accentColor === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setForm({ ...form, accentColor: preset.id })}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border border-border/40 transition-all duration-150 hover:scale-110 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
          <p className="mt-3 text-[11px] text-muted-foreground/60">
            Applies app-wide after you save, and adapts automatically to light
            and dark mode.
          </p>
        </CardContent>
      </Card>

      {/* Personal Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <User className="h-4 w-4 text-primary" />
            Personal Details
          </CardTitle>
          <CardDescription className="text-xs">
            Basic information about you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Preferred Name */}
            <div className="space-y-2">
              <Label htmlFor="preferredName">
                Preferred Name <span className="text-muted-foreground/40">*</span>
              </Label>
              <Input
                id="preferredName"
                placeholder="e.g. Alex, Dr. Chen, Captain..."
                value={form.preferredName}
                onChange={(e) =>
                  setForm({ ...form, preferredName: e.target.value })
                }
              />
              <p className="text-[11px] text-muted-foreground/60">
                Your AI will call you by this name.
              </p>
            </div>

            {/* Pronouns */}
            <div className="space-y-2">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                placeholder="e.g. they/them, she/her, he/him"
                value={form.pronouns}
                onChange={(e) =>
                  setForm({ ...form, pronouns: e.target.value })
                }
              />
            </div>

            {/* Birthday */}
            <div className="space-y-2">
              <Label htmlFor="birthday" className="flex items-center gap-1.5">
                <Cake className="h-3 w-3 text-muted-foreground/60" />
                Birthday
              </Label>
<DatePicker
  value={form.birthday}
  onChange={(date) =>
    setForm({
      ...form,
      birthday: date ? format(date, "yyyy-MM-dd") : "",
    })
  }
/>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-muted-foreground/60" />
                Location
              </Label>
              <Input
                id="location"
                placeholder="e.g. San Francisco, CA"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
              />
            </div>

            {/* Occupation */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="occupation" className="flex items-center gap-1.5">
                <Briefcase className="h-3 w-3 text-muted-foreground/60" />
                Occupation
              </Label>
              <Input
                id="occupation"
                placeholder="e.g. Software Engineer, Designer, Student..."
                value={form.occupation}
                onChange={(e) =>
                  setForm({ ...form, occupation: e.target.value })
                }
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              placeholder="A short description about yourself..."
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="min-h-[80px] resize-y"
            />
            <p className="text-[11px] text-muted-foreground/60">
              A brief summary the AI can use to understand your background.
            </p>
          </div>

          {/* Interests & Skills */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interests" className="flex items-center gap-1.5">
                <Heart className="h-3 w-3 text-muted-foreground/60" />
                Interests
              </Label>
              <Textarea
                id="interests"
                placeholder="e.g. AI, web development, photography, hiking..."
                value={form.interests}
                onChange={(e) =>
                  setForm({ ...form, interests: e.target.value })
                }
                className="min-h-[80px] resize-y"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Your hobbies and passions.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skills" className="flex items-center gap-1.5">
                <Medal className="h-3 w-3 text-muted-foreground/60" />
                Skills
              </Label>
              <Textarea
                id="skills"
                placeholder="e.g. Python, React, TypeScript, Design..."
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                className="min-h-[80px] resize-y"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Your professional skills and expertise.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Links Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Link className="h-4 w-4 text-primary" />
            Social Links
          </CardTitle>
          <CardDescription className="text-xs">
            Links to your profiles on the web.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset links */}
          {LINK_PRESETS.map((preset) => {
            const existing = links.find((l) => l.key === preset.key);
            return (
              <div key={preset.key} className="flex items-center gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-muted/50">
                  <preset.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <Input
                  placeholder={preset.placeholder}
                  value={existing?.value ?? ""}
                  onChange={(e) => {
                    if (existing) {
                      updateLink(preset.key, e.target.value);
                    } else if (e.target.value.trim()) {
                      addLink(preset.key, e.target.value);
                    }
                  }}
                  className="flex-1"
                />
                {existing && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLink(preset.key)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}

          {/* Custom links */}
          {links
            .filter(
              (l) => !LINK_PRESETS.some((p) => p.key === l.key),
            )
            .map((link) => (
              <div key={link.key} className="flex items-center gap-2">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-muted/50">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    {link.key}
                  </span>
                  <input
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 pl-[calc(0.75rem+var(--key-width,60px))] text-sm shadow-xs transition-colors placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ "--key-width": `${link.key.length * 8 + 16}px` } as React.CSSProperties}
                    value={link.value}
                    onChange={(e) => updateLink(link.key, e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLink(link.key)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

          {/* Add custom link */}
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              placeholder="Link name"
              value={customLinkKey}
              onChange={(e) => setCustomLinkKey(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <Input
              placeholder="https://crickdevs.com"
              value={customLinkValue}
              onChange={(e) => setCustomLinkValue(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={!customLinkKey.trim() || !customLinkValue.trim()}
              onClick={() => {
                addLink(customLinkKey, customLinkValue);
                setCustomLinkKey("");
                setCustomLinkValue("");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Customization Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Customization
          </CardTitle>
          <CardDescription className="text-xs">
            How Remi should interact with you — your preferences, context, and
            the assistant&apos;s tone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Preferences / Context */}
          <div className="space-y-2">
            <Label htmlFor="preferences">Context &amp; Preferences</Label>
            <Textarea
              id="preferences"
              placeholder="e.g. I prefer concise answers, I'm a software engineer, I like Python..."
              value={form.preferences}
              onChange={(e) =>
                setForm({ ...form, preferences: e.target.value })
              }
              className="min-h-[80px] resize-y"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Things your AI should know about you — your preferences,
              communication style, and context.
            </p>
          </div>

          {/* Personality */}
          <div className="space-y-2">
            <Label htmlFor="personality">Personality / Tone</Label>
            <Textarea
              id="personality"
              placeholder="e.g. Be warm and encouraging, use emojis, speak like a friend..."
              value={form.personality}
              onChange={(e) =>
                setForm({ ...form, personality: e.target.value })
              }
              className="min-h-[80px] resize-y"
            />
            <p className="text-[11px] text-muted-foreground/60">
              How you want the AI to behave — tone, style, level of formality,
              etc.
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
            {updateMutation.isPending ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
