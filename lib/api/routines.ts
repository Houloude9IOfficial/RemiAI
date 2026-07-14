export type Routine = {
  id: number;
  name: string;
  description: string;
  code: string;
  schedule: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: string | null;
  lastStatus: string | null;
};

export type RoutineLog = {
  id: number;
  routineId: number;
  status: string;
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type RunResult = {
  logId: number;
  routineName: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const routinesApi = {
  list: (): Promise<Routine[]> =>
    fetch("/api/routines").then((res) => unwrap<Routine[]>(res)),

  create: (input: {
    name: string;
    description?: string;
    code: string;
    schedule?: string;
  }): Promise<Routine> =>
    fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Routine>(res)),

  update: (
    id: number,
    input: {
      name?: string;
      description?: string;
      code?: string;
      schedule?: string | null;
      enabled?: boolean;
    },
  ): Promise<Routine> =>
    fetch(`/api/routines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<Routine>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/routines/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),

  run: (id: number): Promise<RunResult> =>
    fetch(`/api/routines/${id}/run`, { method: "POST" }).then((res) =>
      unwrap<RunResult>(res),
    ),

  logs: (id: number, limit?: number): Promise<RoutineLog[]> =>
    fetch(`/api/routines/${id}/logs${limit ? `?limit=${limit}` : ""}`).then(
      (res) => unwrap<RoutineLog[]>(res),
    ),
};
