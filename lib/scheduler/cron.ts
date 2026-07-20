/**
 * Simple cron expression parser for scheduling recurring tasks.
 * Supports standard 5-field cron syntax:
 *
 *   minute (0 - 59), hour (0 - 23), day of month (1 - 31),
 *   month (1 - 12), day of week (0 - 6, Sunday=0)
 *
 * Supported features:
 * - Wildcards (*)
 * - Numeric values (5)
 * - Lists (1,3,5)
 * - Ranges (1-5)
 * - Step values (e.g. * /5, 1-10/2)
 */

/**
 * Parse a single cron field into an array of allowed values.
 */
function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  const parts = field.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check for step values like */5 or 1-10/2
    const stepMatch = trimmed.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      const [, range, stepStr] = stepMatch;
      const step = parseInt(stepStr, 10);
      if (step <= 0) continue;

      let rangeStart: number;
      let rangeEnd: number;
      if (range === "*") {
        rangeStart = min;
        rangeEnd = max;
      } else {
        const [rs, re] = range.split("-").map((s) => parseInt(s.trim(), 10));
        rangeStart = rs;
        rangeEnd = re;
      }

      for (let i = rangeStart; i <= rangeEnd; i += step) {
        if (i >= min && i <= max) values.add(i);
      }
      continue;
    }

    // Wildcard
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // Range (e.g. 1-5)
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) values.add(i);
      }
      continue;
    }

    // Single number
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * Parse a cron expression into parsed fields.
 */
interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: "${expression}". Expected 5 fields (minute hour dom month dow), got ${fields.length}.`,
    );
  }

  return {
    minutes: parseField(fields[0], 0, 59),
    hours: parseField(fields[1], 0, 23),
    daysOfMonth: parseField(fields[2], 1, 31),
    months: parseField(fields[3], 1, 12),
    daysOfWeek: parseField(fields[4], 0, 7),
  };
}

/**
 * Compute the next datetime that matches the cron expression, starting from
 * `fromDate` (inclusive - if fromDate matches, the next match is the following
 * interval).
 */
export function computeNextCronTime(
  expression: string,
  fromDate: Date,
): Date {
  const cron = parseCron(expression);

  // Start looking from the next minute
  const start = new Date(fromDate);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Search within a reasonable window (2 years max) to avoid infinite loops
  const maxDate = new Date(start);
  maxDate.setFullYear(maxDate.getFullYear() + 2);

  let candidate = new Date(start);

  while (candidate <= maxDate) {
    const month = candidate.getMonth() + 1; // 1-12
    const dayOfMonth = candidate.getDate();
    const dayOfWeek = candidate.getDay(); // 0=Sun
    const hour = candidate.getHours();
    const minute = candidate.getMinutes();

    // Check month
    if (!cron.months.includes(month)) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    // Check day of month AND day of week
    const domMatch = cron.daysOfMonth.includes(dayOfMonth);
    // 7 is a Sunday variant in cron syntax; only treat it as matching on Sunday (dayOfWeek=0)
    const dowMatch = cron.daysOfWeek.includes(dayOfWeek) ||
      (dayOfWeek === 0 && cron.daysOfWeek.includes(7));

    // Determine if day-of-month or day-of-week fields are restricted
    const domRestricted = cron.daysOfMonth.length < 31;
    const dowRestricted = cron.daysOfWeek.length < 7;

    if (domRestricted || dowRestricted) {
      if (domRestricted && dowRestricted) {
        // Both restricted - match EITHER day-of-month OR day-of-week
        if (!domMatch && !dowMatch) {
          candidate.setDate(candidate.getDate() + 1);
          candidate.setHours(0, 0, 0, 0);
          continue;
        }
      } else if (domRestricted && !domMatch) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      } else if (dowRestricted && !dowMatch) {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
        continue;
      }
    }

    // Check hour
    if (!cron.hours.includes(hour)) {
      candidate.setHours(candidate.getHours() + 1);
      candidate.setMinutes(0, 0, 0);
      continue;
    }

    // Check minute
    if (!cron.minutes.includes(minute)) {
      candidate.setMinutes(candidate.getMinutes() + 1);
      continue;
    }

    // All fields match!
    return candidate;
  }

  throw new Error(
    `Could not find a matching time for cron expression "${expression}" within 2 years.`,
  );
}

/**
 * Get a human-readable description of a cron expression.
 */
export function describeCron(expression: string): string {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return expression;

  const [min, hour, dom, month, dow] = fields;

  if (min === "0" && hour === "0" && dom === "*" && month === "*" && dow === "*") {
    return "Daily at midnight";
  }
  if (min === "0" && hour === "12" && dom === "*" && month === "*" && dow === "*") {
    return "Daily at noon";
  }
  if (min === "0" && dom === "*" && month === "*" && dow === "*") {
    return `Daily at ${parseInt(hour, 10)}:00`;
  }
  if (min === "0" && hour === "0" && dom === "*" && month === "*" && dow !== "*") {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (/^\d+$/.test(dow)) {
      return `Every ${dayNames[parseInt(dow, 10)]} at midnight`;
    }
    if (/^\d+-\d+$/.test(dow)) {
      const [s, e] = dow.split("-").map(Number);
      return `${dayNames[s]} through ${dayNames[e]} at midnight`;
    }
  }
  if (min === "0" && hour === "9" && dom === "*" && month === "*" && dow === "1-5") {
    return "Weekdays at 9:00 AM";
  }
  if (min === "0" && hour === "0" && dom === "1" && month === "*" && dow === "*") {
    return "First of every month at midnight";
  }
  if (/^\*\/\d+$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const interval = parseInt(min.split("/")[1], 10);
    return `Every ${interval} minute${interval === 1 ? "" : "s"}`;
  }
  if (min === "0" && /^\*\/\d+$/.test(hour) && dom === "*" && month === "*" && dow === "*") {
    const interval = parseInt(hour.split("/")[1], 10);
    return `Every ${interval} hour${interval === 1 ? "" : "s"}`;
  }

  return expression;
}
