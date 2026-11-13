import type { InteractiveVisualSpec } from "./interactive-visual";

export const apiUsageVisual: InteractiveVisualSpec = {
  version: 1,
  description: "Interactive example · Sample data",
  icon: "activity",
  badge: "Live demo",
  controls: [
    { id: "days", type: "segments", label: "Forecast period", initial: 7,
      options: [{ label: "7 days", value: 7 }, { label: "30 days", value: 30 }] },
    { id: "daily", type: "slider", label: "Requests per day", min: 100, max: 2000, step: 25, initial: 500 },
    { id: "duration", type: "slider", label: "Average execution duration", min: 50, max: 1000, step: 25, initial: 250, format: { unit: " ms" } },
    { id: "details", type: "checkbox", label: "Show calculation details", initial: true },
  ],
  calculations: [
    { id: "requests", op: "multiply", a: "daily", b: "days" },
    { id: "runtime_ms", op: "multiply", a: "requests", b: "duration" },
    { id: "seconds", op: "divide", a: "runtime_ms", b: 1000 },
    { id: "minutes", op: "divide", a: "seconds", b: 60, format: { digits: 1 } },
    { id: "hours", op: "divide", a: "seconds", b: 3600, format: { digits: 3 } },
  ],
  blocks: [
    { type: "controls", ids: ["days"] },
    { type: "metrics", items: [
      { title: "Total requests", icon: "trend", value: "requests", description: "Over {days} days" },
      { title: "Execution time", icon: "clock", value: "minutes", format: { digits: 1, unit: "m" }, description: "Estimated total" },
    ] },
    { type: "controls", ids: ["daily", "duration"] },
    { type: "chart", chart: "bar", title: "Projected requests", series: "Requests", colorful: true,
      caption: "Illustrative traffic distribution based on your selected daily average.",
      when: { source: "days", op: "eq", value: 7 },
      projection: { total: "requests", count: "days", labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        weights: [400, 500, 550, 575, 625, 475, 375] } },
    { type: "chart", chart: "bar", title: "Projected requests", series: "Requests", colorful: true,
      caption: "Illustrative traffic distribution based on your selected daily average.",
      when: { source: "days", op: "eq", value: 30 },
      projection: { total: "requests", count: "days", weights: [400, 500, 550, 575, 625, 475, 375] } },
    { type: "controls", ids: ["details"] },
    { type: "text", when: { source: "details", op: "eq", value: true }, lines: [
      "Requests: {daily} × {days} = {requests}",
      "Runtime: {requests} × {duration} ms = {seconds} seconds",
      "Total execution: {hours} hours",
    ] },
    { type: "copy", label: "Copy results", lines: [
      "Forecast period: {days} days", "Requests per day: {daily}", "Average execution duration: {duration} ms",
      "Total requests: {requests}", "Execution time: {minutes} minutes ({seconds} seconds)",
    ] },
  ],
};
