import { z } from "zod";

export const directoryCreateSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).max(100),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
});

export const directoryUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  canRead: z.boolean().optional(),
  canWrite: z.boolean().optional(),
  watchEnabled: z.boolean().optional(),
});

export const directoryValidateSchema = z.object({
  path: z.string().min(1),
});

export const providerKindSchema = z.enum([
  "anthropic",
  "openai",
  "ollama",
  "openai-compatible",
]);

export const providerCreateSchema = z.object({
  kind: providerKindSchema,
  isPreset: z.boolean(),
  label: z.string().min(1).max(100),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
});

export const providerUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export const providerModelCreateSchema = z.object({
  modelId: z.string().min(1).max(200),
  label: z.string().max(200).optional().nullable(),
});

export const providerModelUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  label: z.string().max(200).optional().nullable(),
});

export const mcpTransportSchema = z.enum(["stdio", "http"]);

export const mcpServerCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    transport: mcpTransportSchema,
    command: z.string().optional().nullable(),
    args: z.array(z.string()).optional().nullable(),
    env: z.record(z.string(), z.string()).optional().nullable(),
    url: z.string().url().optional().nullable(),
    headers: z.record(z.string(), z.string()).optional().nullable(),
  })
  .refine(
    (v) => (v.transport === "stdio" ? !!v.command : !!v.url),
    { message: "stdio servers require a command; http servers require a url" },
  );

export const mcpServerUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  command: z.string().optional().nullable(),
  args: z.array(z.string()).optional().nullable(),
  env: z.record(z.string(), z.string()).optional().nullable(),
  url: z.string().url().optional().nullable(),
  headers: z.record(z.string(), z.string()).optional().nullable(),
  enabled: z.boolean().optional(),
});
