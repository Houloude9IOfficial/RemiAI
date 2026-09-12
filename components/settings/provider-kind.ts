import type { LucideIcon } from "lucide-react";
import { Bot, Braces, Cpu, Sparkles, Zap } from "lucide-react";
import type { ProviderKind } from "@/lib/api/providers";
import { BsAnthropic, BsOpenai } from "react-icons/bs";
import { SiOllama, SiGooglegemini, SiMistralai, SiOpenrouter } from "react-icons/si";
import { BiSolidZap } from "react-icons/bi";

export type ProviderKindMeta = {
  label: string;
  description: string;
  icon: LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;
  apiKeyPlaceholder?: string;
};

/**
 * Presentational metadata for each provider kind, used by both the
 * "connect a provider" picker and the provider list.
 */
export const PROVIDER_KIND_META: Record<ProviderKind, ProviderKindMeta> = {
  anthropic: { 
    label: "Anthropic", 
    description: "Claude models", 
    icon: BsAnthropic,
    apiKeyPlaceholder: "sk-ant-...",
  },
  openai: { 
    label: "OpenAI", 
    description: "GPT models", 
    icon: BsOpenai,
    apiKeyPlaceholder: "sk-proj-...",
  },
  ollama: { 
    label: "Ollama", 
    description: "Local models", 
    icon: SiOllama,
  },
  "openai-compatible": {
    label: "Custom",
    description: "OpenAI-compatible",
    icon: Braces,
    apiKeyPlaceholder: "sk-...",
  },
  google: { 
    label: "Google", 
    description: "Gemini models", 
    icon: SiGooglegemini,
    apiKeyPlaceholder: "AIzaSy...",
  },
  mistral: { 
    label: "Mistral", 
    description: "Mistral models", 
    icon: SiMistralai,
    apiKeyPlaceholder: "sk-...",
  },
  groq: { 
    label: "Groq", 
    description: "Groq models", 
    icon: BiSolidZap,
    apiKeyPlaceholder: "gsk_...",
  },
  openrouter: { 
    label: "OpenRouter", 
    description: "Any model", 
    icon: SiOpenrouter,
    apiKeyPlaceholder: "sk-or-...",
  },
};