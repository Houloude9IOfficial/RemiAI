/**
 * Shared "current time" helper used by the AI tools (`get_time_details`) and
 * the conversation-starter route. Computes the current date/time in a given
 * IANA timezone (e.g. "Europe/Bucharest") and falls back to the server's own
 * timezone when none is provided or the value is invalid.
 */

export interface TimeDetails {
  iso: string;
  date: string;
  time: string;
  time24h: string;
  timezone: string;
  utcOffset: string;
  utcOffsetMinutes: number;
  weekday: string;
  dayOfMonth: number;
  month: string;
  year: number;
  timestamp: number;
}

const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** True if the string is a valid IANA timezone name (or at least accepted by Intl). */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the UTC offset in minutes for `date` in `timeZone` (positive east
 * of UTC, negative west). Falls back to the server offset on failure.
 */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);

    const m: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") m[p.type] = p.value;
    }

    const asUTC = Date.UTC(
      Number(m.year),
      Number(m.month) - 1,
      Number(m.day),
      Number(m.hour) % 24,
      Number(m.minute),
      Number(m.second),
    );
    return Math.round((asUTC - date.getTime()) / 60_000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

/**
 * Structured current date/time details.
 *
 * @param timezone - IANA timezone of the USER (e.g. "America/New_York").
 *   When omitted or invalid, the server's own timezone is used.
 */
export function getTimeDetails(timezone?: string): TimeDetails {
  const now = new Date();
  const tz =
    timezone && isValidTimeZone(timezone)
      ? timezone
      : (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  // Fallbacks = server-local values (used if the Intl tz formatter fails).
  let weekday = DAYS[now.getDay()]!;
  let month = MONTHS[now.getMonth()]!;
  let dayOfMonth = now.getDate();
  let year = now.getFullYear();
  let hour = now.getHours();
  let minute = now.getMinutes();
  let second = now.getSeconds();
  let offsetMinutes = -now.getTimezoneOffset();

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(now);

    const m: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") m[p.type] = p.value;
    }

    weekday = m.weekday ?? weekday;
    month = m.month ?? month;
    dayOfMonth = Number(m.day) || dayOfMonth;
    year = Number(m.year) || year;
    hour = (Number(m.hour) || 0) % 24;
    minute = Number(m.minute) || 0;
    second = Number(m.second) || 0;
    offsetMinutes = tzOffsetMinutes(now, tz);
  } catch {
    // Keep server-local fallbacks above.
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetStr = `UTC${offsetSign}${pad(Math.floor(absMinutes / 60))}:${pad(absMinutes % 60)}`;

  return {
    iso: now.toISOString(),
    date: `${weekday}, ${month} ${dayOfMonth}, ${year}`,
    time: `${hour12}:${pad(minute)}:${pad(second)} ${period}`,
    time24h: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    timezone: tz,
    utcOffset: offsetStr,
    utcOffsetMinutes: offsetMinutes,
    weekday,
    dayOfMonth,
    month,
    year,
    timestamp: now.getTime(),
  };
}
