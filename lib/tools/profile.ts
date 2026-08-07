import { z } from "zod";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { truncateToolResult } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpdateProfileParams {
  preferredName?: string;
  bio?: string;
  location?: string;
  occupation?: string;
  interests?: string;
  skills?: string;
  pronouns?: string;
  birthday?: string;
  preferences?: string;
  personality?: string;
  links?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Update fields definition (shared between Zod schema and execute logic)
// ---------------------------------------------------------------------------

const UPDATE_FIELDS = [
  "preferredName",
  "bio",
  "location",
  "occupation",
  "interests",
  "skills",
  "pronouns",
  "birthday",
  "preferences",
  "personality",
  "links",
] as const;

// ---------------------------------------------------------------------------
// Tool builder
// ---------------------------------------------------------------------------

/**
 * Build profile tools that allow the AI to view and manage the user's
 * profile information (name, bio, location, occupation, interests, skills,
 * pronouns, birthday, links, preferences, personality).
 *
 * These tools are always available so the AI can personalise its responses
 * and help the user update their profile naturally through conversation.
 */
export function buildProfileTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  // -----------------------------------------------------------------------
  // get_profile
  // -----------------------------------------------------------------------
  tools.get_profile = {
    description:
      "Get the user's complete profile (name, bio, location, occupation, interests, skills, pronouns, birthday, links, preferences, personality). Use to personalise responses or when the user asks what you know about them.",
    parameters: z.object({}),
    execute: async () => {
      const prefs = await db.select().from(userPreferences).get();

      if (!prefs) {
        return truncateToolResult({
          exists: false,
          message: "No profile found. The user hasn't set up their profile yet.",
        });
      }

      return truncateToolResult({
        exists: true,
        profile: {
          preferredName: prefs.preferredName || null,
          avatarUrl: prefs.avatarUrl || null,
          bio: prefs.bio || null,
          location: prefs.location || null,
          occupation: prefs.occupation || null,
          interests: prefs.interests || null,
          skills: prefs.skills || null,
          pronouns: prefs.pronouns || null,
          birthday: prefs.birthday || null,
          links: prefs.links || {},
          preferences: prefs.preferences || null,
          personality: prefs.personality || null,
        },
      });
    },
  };

  // -----------------------------------------------------------------------
  // update_profile
  // -----------------------------------------------------------------------
  tools.update_profile = {
    description:
      "Update one or more fields in the user's profile. Only provided fields change; others stay. Use when the user shares permanent info about themselves (name, location, job, interests, links, etc.).",
    parameters: z.object({
      preferredName: z
        .string()
        .max(100)
        .optional()
        .describe("Name the user wants to be called"),
      bio: z
        .string()
        .max(1000)
        .optional()
        .describe("Short description about the user"),
      location: z
        .string()
        .max(200)
        .optional()
        .describe("Where the user is located (city, country)"),
      occupation: z
        .string()
        .max(200)
        .optional()
        .describe("The user's job title, role, or profession"),
      interests: z
        .string()
        .max(1000)
        .optional()
        .describe("The user's hobbies, passions, and interests"),
      skills: z
        .string()
        .max(1000)
        .optional()
        .describe("The user's professional skills and expertise"),
      pronouns: z
        .string()
        .max(50)
        .optional()
        .describe("The user's pronouns (e.g. they/them, she/her, he/him)"),
      birthday: z
        .string()
        .max(20)
        .optional()
        .describe("The user's birthday (ISO format YYYY-MM-DD)"),
      links: z
        .record(z.string(), z.string())
        .optional()
        .describe("Social links as key-value pairs (e.g. { github: '...', twitter: '...' })"),
      preferences: z
        .string()
        .max(2000)
        .optional()
        .describe("The user's preferences and context the AI should know"),
      personality: z
        .string()
        .max(2000)
        .optional()
        .describe("How the AI should behave — tone, style, formality"),
    }),
    execute: async (data: UpdateProfileParams) => {
      const existing = await db.select().from(userPreferences).get();

      // Build the update payload: only include fields that were actually provided
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      for (const field of UPDATE_FIELDS) {
        if ((data as any)[field] !== undefined) {
          updateData[field] = (data as any)[field];
        }
      }

      if (Object.keys(updateData).filter((k) => k !== "updatedAt").length === 0) {
        return truncateToolResult({
          ok: true,
          changed: false,
          message: "No fields were provided to update.",
        });
      }

      if (existing) {
        await db
          .update(userPreferences)
          .set(updateData)
          .where(eq(userPreferences.id, existing.id));
      } else {
        await db.insert(userPreferences).values({
          ...updateData,
          preferredName: updateData.preferredName ?? "",
          preferences: updateData.preferences ?? "",
          personality: updateData.personality ?? "Be helpful, concise, and direct. Match the user's tone.",
          avatarUrl: "",
          bio: updateData.bio ?? "",
          location: updateData.location ?? "",
          occupation: updateData.occupation ?? "",
          interests: updateData.interests ?? "",
          skills: updateData.skills ?? "",
          pronouns: updateData.pronouns ?? "",
          birthday: updateData.birthday ?? "",
          links: updateData.links ?? {},
        });
      }

      const changedFields = Object.keys(updateData).filter((k) => k !== "updatedAt");

      return truncateToolResult({
        ok: true,
        changed: true,
        updated: changedFields,
        message: `Updated profile: ${changedFields.join(", ")}.`,
      });
    },
  };

  return tools;
}
