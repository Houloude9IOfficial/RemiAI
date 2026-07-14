import { db } from "@/db";
import { routines } from "@/db/schema";
import { executeRoutine } from "./runner";

// ---------------------------------------------------------------------------
// Simple cron expression parser
// Supports: *, */N, N, N-M, N,M,O for minute, hour, day-of-month, month, day-of-week
// Format: minute hour day-of-month month day-of-week
// ---------------------------------------------------------------------------

/**
 * Parse a single cron field value into a set of accepted values (0-∞).
 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  // Handle comma-separated values
  const parts = field.split(",");
  for (const part of parts) {
    const trimmed = part.trim();

    // Handle step values: */N or X-N/N
    const stepMatch = trimmed.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      const range = stepMatch[1];
      const step = parseInt(stepMatch[2], 10);

      let rangeStart: number;
      let rangeEnd: number;

      if (range === "*") {
        rangeStart = min;
        rangeEnd = max;
      } else {
        const rangeParts = range.split("-");
        rangeStart = parseInt(rangeParts[0], 10);
        rangeEnd = parseInt(rangeParts[1], 10);
      }

      for (let i = rangeStart; i <= rangeEnd; i += step) {
        values.add(i);
      }
      continue;
    }

    // Handle range: N-M
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle wildcard
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle exact value
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
      values.add(num);
    }
  }

  return values;
}

/**
 * Check if a cron expression matches the given date.
 * Returns true if the cron should fire at this time (within the current minute).
 */
export function isCronDue(
  cronExpression: string,
  date: Date = new Date(),
): boolean {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false; // Invalid cron expression
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;

  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const days = parseCronField(dayField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const weekdays = parseCronField(weekdayField, 0, 6);

  const nowMinute = date.getMinutes();
  const nowHour = date.getHours();
  const nowDay = date.getDate();
  const nowMonth = date.getMonth() + 1; // JS months are 0-indexed
  const nowWeekday = date.getDay(); // 0 = Sunday

  return (
    minutes.has(nowMinute) &&
    hours.has(nowHour) &&
    days.has(nowDay) &&
    months.has(nowMonth) &&
    weekdays.has(nowWeekday)
  );
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let runningRoutines = new Set<number>(); // Track currently executing routines
const lastExecutedMinute = new Map<number, number>(); // routineId → last minute executed

/**
 * Start the routine scheduler. It polls the database every 30 seconds
 * for enabled routines with schedules, checks if they're due, and runs them.
 *
 * Call this once on app startup (from db/index.ts).
 */
export function startRoutineScheduler(): void {
  if (intervalHandle) return; // Already running

  intervalHandle = setInterval(async () => {
    try {
      await checkDueRoutines();
    } catch (err) {
      console.error("[routine-scheduler] Error checking due routines:", err);
    }
  }, CHECK_INTERVAL_MS);

  // Also run immediately on start
  checkDueRoutines().catch((err) =>
    console.error("[routine-scheduler] Initial check error:", err),
  );

  console.log("[routine-scheduler] Started (checking every 30s)");
}

/**
 * Stop the routine scheduler.
 */
export function stopRoutineScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[routine-scheduler] Stopped");
  }
}

/**
 * Check for due routines and execute them.
 */
async function checkDueRoutines(): Promise<void> {
  const allRoutines = await db
    .select()
    .from(routines)
    .all();

  const now = new Date();

  for (const routine of allRoutines) {
    // Skip if no schedule, not enabled, or already running
    if (!routine.schedule || !routine.enabled) continue;
    if (runningRoutines.has(routine.id)) continue; // Already executing

    // Check if we've already executed this routine in the current minute
    // to prevent double-firing from the 30-second polling interval
    const currentMinute = now.getFullYear() * 1000000 +
      (now.getMonth() + 1) * 10000 +
      now.getDate() * 100 +
      now.getHours() * 60 +
      now.getMinutes();
    const lastMinute = lastExecutedMinute.get(routine.id) ?? -1;
    if (lastMinute === currentMinute) continue; // Already ran this minute

    if (isCronDue(routine.schedule, now)) {
      // Mark as running to prevent duplicate execution
      runningRoutines.add(routine.id);
      lastExecutedMinute.set(routine.id, currentMinute);

      // Execute asynchronously (don't await — let it run in background)
      executeRoutine(routine.id, 60_000)
        .then(({ logId, result }) => {
          console.log(
            `[routine-scheduler] Routine "${routine.name}" completed (log #${logId}): ` +
            `exitCode=${result.exitCode}, duration=${result.durationMs}ms`,
          );
        })
        .catch((err) => {
          console.error(
            `[routine-scheduler] Routine "${routine.name}" failed:`,
            err,
          );
        })
        .finally(() => {
          runningRoutines.delete(routine.id);
        });
    }
  }
}
