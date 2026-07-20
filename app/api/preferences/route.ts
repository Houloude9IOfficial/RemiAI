import { NextResponse } from "next/server";
import { db } from "@/db";
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
};

export async function GET() {
  let prefs = await db.select().from(userPreferences).get();

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
  };

  const existing = await db.select().from(userPreferences).get();

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
