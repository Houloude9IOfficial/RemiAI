import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import {
  resolveNewModelEnabled,
} from "./model-preferences-policy";

/** Read the global preference used by every model creation path. */
export async function shouldEnableNewModels(): Promise<boolean> {
  const prefs = await db
    .select({ enableNewModels: userPreferences.enableNewModels })
    .from(userPreferences)
    .get();

  return resolveNewModelEnabled(prefs?.enableNewModels);
}
