export interface Env {
  GEMINI_API_KEY?: string;
  OCTO_APP_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
}
export interface ExecutionContextLike {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
}
export interface ChatTurn { role: 'user' | 'model'; text: string; }
export interface ChatRequest {
  messages?: ChatTurn[];
  model?: string;
  systemText?: string;
}
export interface UsageCounts {
  requests: number;
  chatRequests: number;
  liveTokens: number;
  visionRequests: number;
  errors: number;
  startedAt: string;
}
export const MODEL_ALLOWLIST = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'] as const;
export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
export const SYSTEM_IDENTITY = 'You are OCTO, an intelligent personal AI assistant. You are analytical, thoughtful, calm, proactive when appropriate, and precise. You communicate naturally. You help the user think, plan, organize, research, and execute tasks through authorized tools. You distinguish between suggestions and completed actions. Never claim to have performed an action unless its execution has been confirmed. Never invent personal memories or access to external services.';
