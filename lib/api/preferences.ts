export type UserPreferences = {
  preferredName: string;
  preferences: string;
  personality: string;
  avatarUrl: string;
  bio: string;
  location: string;
  occupation: string;
  interests: string;
  skills: string;
  pronouns: string;
  birthday: string;
  links: Record<string, string>;
  accentColor: string;
  backgroundColor: string;
  enableNewModels: boolean;
  remiApiUrl: string;
  remiApiEnabled: boolean;
  cardDisplayModes: Record<string, string>;
  collapseLongUserMessages: boolean;
  expandReasoningWhileWorking: boolean;
};

export const CARD_IDS = [
  "weather",
  "timezone",
  "currency",
  "map",
  "crypto",
  "news",
  "stock",
] as const;
export type CardId = (typeof CARD_IDS)[number];

export const CARD_DISPLAY_CHOICES = ["card", "text"] as const;
export type CardDisplayMode = (typeof CARD_DISPLAY_CHOICES)[number];

async function get(): Promise<UserPreferences> {
  const res = await fetch("/api/preferences");
  if (!res.ok) throw new Error("Failed to fetch preferences");
  return res.json();
}

async function update(
  data: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json();
}

export const preferencesApi = { get, update };
