"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { BACKGROUND_PRESETS } from "@/lib/background-colors";
import { useTheme } from "@/components/ThemeProvider";
import { useAppearancePreview } from "@/components/AppearancePreviewProvider";

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
  backgroundColor: "",
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

function linksToObject(links: LinkEntry[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const { key, value } of links) {
    if (key.trim() && value.trim()) {
      obj[key.trim()] = value.trim();
    }
  }
  return obj;
}

function linksEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i] || a[aKeys[i]] !== b[bKeys[i]]) return false;
  }
  return true;
}

function preferencesEqual(a: UserPreferences, b: UserPreferences): boolean {
  return (
    a.preferredName === b.preferredName &&
    a.preferences === b.preferences &&
    a.personality === b.personality &&
    a.avatarUrl === b.avatarUrl &&
    a.bio === b.bio &&
    a.location === b.location &&
    a.occupation === b.occupation &&
    a.interests === b.interests &&
    a.skills === b.skills &&
    a.pronouns === b.pronouns &&
    a.birthday === b.birthday &&
    a.accentColor === b.accentColor &&
    a.backgroundColor === b.backgroundColor &&
    linksEqual(a.links || {}, b.links || {})
  );
}

export function ProfileForm() {
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
  const accentTheme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";
  const [form, setForm] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const [customLinkKey, setCustomLinkKey] = useState("");
  const [customLinkValue, setCustomLinkValue] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Last confirmed server-side preferences, used to detect unsaved changes.
  const serverRef = useRef<UserPreferences | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  // Hydrate the form once from the server, then leave it alone so in-flight
  // edits aren't clobbered by refetches after auto-saves.
  useEffect(() => {
    if (data && !hydrated) {
      setForm(data);
      setLinks(
        Object.entries(data.links || {}).map(([key, value]) => ({
          key,
          value,
        })),
      );
      serverRef.current = data;
      setHydrated(true);
    }
  }, [data, hydrated]);

  // Keep track of the latest confirmed server state.
  useEffect(() => {
    if (data) serverRef.current = data;
  }, [data]);

  // Revert any unsaved accent/background preview when leaving this page.
  useEffect(() => {
    return () => clearPreviews();
  }, [clearPreviews]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => preferencesApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: () => {
      toast.error("Failed to save profile");
    },
  });

  const savePreferences = updateMutation.mutate;

  // Auto-save any changes (debounced).
  useEffect(() => {
    if (isLoading || !data || !hydrated) return;

    const payload = { ...form, links: linksToObject(links) };
    if (serverRef.current && preferencesEqual(payload, serverRef.current)) {
      return;
    }

    const timeout = setTimeout(() => {
      savePreferences(payload);
    }, 400);

    return () => clearTimeout(timeout);
  }, [form, links, isLoading, data, hydrated, savePreferences]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return !preferencesEqual({ ...form, links: linksToObject(links) }, data);
  }, [form, links, data]);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your personal details, social links, and AI preferences. Remi uses
            this information to personalise every conversation.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {updateMutation.isPending || dirty ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              All changes saved
            </>
          )}
        </div>
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
            Appearance
          </CardTitle>
          <CardDescription className="text-xs">
            Personalise the app&apos;s accent color and background palette.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Accent color */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Accent color</p>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Default */}
              <button
                type="button"
                onClick={() => {
                  setAccentPreview("");
                  setForm({ ...form, accentColor: "" });
                }}
                onMouseEnter={() => setAccentHover("")}
                onMouseLeave={() => clearAccentHover()}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border border-border transition-all duration-150 hover:scale-110 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  form.accentColor === "" &&
                    "ring-2 ring-foreground ring-offset-2",
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
                    onClick={() => {
                      setAccentPreview(preset.id);
                      setForm({ ...form, accentColor: preset.id });
                    }}
                    onMouseEnter={() => setAccentHover(preset.id)}
                    onMouseLeave={() => clearAccentHover()}
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
            <p className="text-[11px] text-muted-foreground/60">
              Used for buttons, highlights, and focus rings.
            </p>
          </div>

          {/* Background */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold">Background</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setBackgroundPreview("");
                  setForm({ ...form, backgroundColor: "" });
                }}
                onMouseEnter={() => setBackgroundHover("")}
                onMouseLeave={() => clearBackgroundHover()}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  form.backgroundColor === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:border-foreground/40 hover:bg-accent/40",
                )}
                aria-pressed={form.backgroundColor === ""}
              >
                Default
              </button>

              {BACKGROUND_PRESETS.map((preset) => {
                const selected = form.backgroundColor === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setBackgroundPreview(preset.id);
                      setForm({ ...form, backgroundColor: preset.id });
                    }}
                    onMouseEnter={() => setBackgroundHover(preset.id)}
                    onMouseLeave={() => clearBackgroundHover()}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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

        </CardContent>
      </Card>
    </div>
  );
}
