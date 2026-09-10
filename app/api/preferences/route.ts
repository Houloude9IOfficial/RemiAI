import { NextResponse } from "next/server";
import { db, ensureRemiPrefsColumns } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_PREFERENCES = {
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
  links: {} as Record<string, string>,
  accentColor: "",
  backgroundColor: "",
  enableNewModels: true,
  remiApiUrl: "",
  remiApiEnabled: true,
  cardDisplayModes: {} as Record<string, string>,
};

function isMissingColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return msg.includes("no such column") || msg.includes("has no column");
}

export async function GET() {
  let prefs: (typeof userPreferences.$inferSelect) | undefined;
  try {
    prefs = await db.select().from(userPreferences).get();
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    ensureRemiPrefsColumns();
    prefs = await db.select().from(userPreferences).get();
  }

  if (!prefs) {
    // Seed a default row on first access so the chat route always finds one
    const now = new Date().toISOString();
    await db
      .insert(userPreferences)
      .values({ ...DEFAULT_PREFERENCES, updatedAt: now });
    prefs = await db.select().from(userPreferences).get();
  }

  return NextResponse.json({
    preferredName: prefs!.preferredName,
    preferences: prefs!.preferences,
    personality: prefs!.personality,
    avatarUrl: prefs!.avatarUrl,
    bio: prefs!.bio,
    location: prefs!.location,
    occupation: prefs!.occupation,
    interests: prefs!.interests,
    skills: prefs!.skills,
    pronouns: prefs!.pronouns,
    birthday: prefs!.birthday,
    links: prefs!.links,
    accentColor: prefs!.accentColor,
    backgroundColor: prefs!.backgroundColor,
    enableNewModels: prefs!.enableNewModels,
    remiApiUrl: ((prefs as Record<string, unknown>).remiApiUrl as string | undefined) ?? "",
    remiApiEnabled: ((prefs as Record<string, unknown>).remiApiEnabled as boolean | undefined) ?? true,
    cardDisplayModes: ((prefs as Record<string, unknown>).cardDisplayModes as Record<string, string> | undefined) ?? {},
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    preferredName?: string;
    preferences?: string;
    personality?: string;
    avatarUrl?: string;
    bio?: string;
    location?: string;
    occupation?: string;
    interests?: string;
    skills?: string;
    pronouns?: string;
    birthday?: string;
    links?: Record<string, string>;
    accentColor?: string;
    backgroundColor?: string;
    enableNewModels?: boolean;
    remiApiUrl?: string;
    remiApiEnabled?: boolean;
    cardDisplayModes?: Record<string, string>;
  };

  let existing: (typeof userPreferences.$inferSelect) | undefined;
  try {
    existing = await db.select().from(userPreferences).get();
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    ensureRemiPrefsColumns();
    existing = await db.select().from(userPreferences).get();
  }

  const data = {
    preferredName: body.preferredName ?? existing?.preferredName ?? "",
    preferences: body.preferences ?? existing?.preferences ?? "",
    personality: body.personality ?? existing?.personality ?? "Be helpful, concise, and direct. Match the user's tone.",
    avatarUrl: body.avatarUrl ?? existing?.avatarUrl ?? "",
    bio: body.bio ?? existing?.bio ?? "",
    location: body.location ?? existing?.location ?? "",
    occupation: body.occupation ?? existing?.occupation ?? "",
    interests: body.interests ?? existing?.interests ?? "",
    skills: body.skills ?? existing?.skills ?? "",
    pronouns: body.pronouns ?? existing?.pronouns ?? "",
    birthday: body.birthday ?? existing?.birthday ?? "",
    links: body.links ?? existing?.links ?? {},
    accentColor: body.accentColor ?? existing?.accentColor ?? "",
    backgroundColor: body.backgroundColor ?? existing?.backgroundColor ?? "",
    enableNewModels: body.enableNewModels ?? existing?.enableNewModels ?? true,
    remiApiUrl: body.remiApiUrl ?? ((existing as unknown as Record<string, unknown> | null)?.remiApiUrl as string | undefined) ?? "",
    remiApiEnabled: body.remiApiEnabled ?? ((existing as unknown as Record<string, unknown> | null)?.remiApiEnabled as boolean | undefined) ?? true,
    cardDisplayModes: body.cardDisplayModes ?? ((existing as unknown as Record<string, unknown> | null)?.cardDisplayModes as Record<string, string> | undefined) ?? {},
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    await db
      .update(userPreferences)
      .set(data)
      .where(eq(userPreferences.id, existing.id));
  } else {
    await db.insert(userPreferences).values(data);
  }

  return NextResponse.json({ success: true, ...data });
}
