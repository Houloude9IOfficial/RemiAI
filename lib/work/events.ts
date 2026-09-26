export type WorkRunEvent = { conversationId: number; runId: number; phase: string; updatedAt: string };
type Listener = (event: WorkRunEvent) => void;
const shared = globalThis as typeof globalThis & { remiWorkListeners?: Set<Listener>; remiWorkEvents?: Map<number, WorkRunEvent> };
const listeners = shared.remiWorkListeners ??= new Set<Listener>();
const latest = shared.remiWorkEvents ??= new Map<number, WorkRunEvent>();
export function publishWorkRunEvent(event: WorkRunEvent) { latest.set(event.conversationId, event); for (const listener of listeners) { try { listener(event); } catch { listeners.delete(listener); } } }
export function latestWorkRunEvent(conversationId: number) { return latest.get(conversationId); }
export function subscribeWorkRunEvents(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener); }
