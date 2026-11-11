import type { AIProvider } from "../../../../../shared/models/conversation";

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
};
