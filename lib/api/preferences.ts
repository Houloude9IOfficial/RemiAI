export type UserPreferences = {
  preferredName: string;
  preferences: string;
  personality: string;
};

async function get(): Promise<UserPreferences> {
  const res = await fetch("/api/preferences");
  if (!res.ok) throw new Error("Failed to fetch preferences");
  return res.json();
}

async function update(data: Partial<UserPreferences>): Promise<UserPreferences> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json();
}

export const preferencesApi = { get, update };
