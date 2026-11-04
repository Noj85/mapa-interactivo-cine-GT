import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const claudeEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;
export function claude() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
