import OpenAI from "openai";
import { getConfig, marca } from "@/lib/config";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let client: OpenAI | null = null;

/**
 * Cliente OpenAI-compatible apuntando a OpenRouter.
 * OpenRouter normaliza tool calling y response_format al formato OpenAI,
 * asi que el resto del codigo del agente no cambia.
 */
export function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no configurada");
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      // OPENROUTER_BASE_URL permite cualquier proveedor compatible con la API de OpenAI
      // (y un servidor simulado para las pruebas de punta a punta).
      baseURL: process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
      defaultHeaders: {
        // OpenRouter usa estos headers para ranking en su leaderboard (opcional)
        "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3000",
        "X-Title": marca().nombre,
      },
    });
  }
  return client;
}

/** AGENT_MODEL (entorno) -> config.agente.modelo -> default del nucleo. */
export function getAgentModel(): string {
  return process.env.AGENT_MODEL || getConfig().agente.modelo || DEFAULT_MODEL;
}

/**
 * Modelo del juez del Laboratorio (spec nucleo/17). Conviene uno mas capaz que el del
 * agente: el agente puede ser barato, el que lo evalua no. Cae al del agente.
 */
export function getJudgeModel(): string {
  return process.env.AGENT_JUDGE_MODEL?.trim() || getAgentModel();
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
