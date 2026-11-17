// ============================================================
// AI Provider Abstraction — Local-First, Ollama, OpenAI
// Never requires paid API; deterministic fallback ensures 100% uptime
// ============================================================

import { config } from '../../config/index.js';

export interface LLMRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generateText(req: LLMRequest): Promise<string>;
}

/**
 * Local Deterministic Provider (Offline Fallback)
 * Works anywhere, zero tokens, zero network requests, instant response.
 */
export class LocalDeterministicProvider implements LLMProvider {
  name = 'local_deterministic';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateText(_req: LLMRequest): Promise<string> {
    return JSON.stringify({
      status: 'fallback',
      message: 'Local deterministic processing active',
    });
  }
}

/**
 * Ollama Local Provider (Privacy-Preserving Local LLM)
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateText(req: LLMRequest): Promise<string> {
    const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: (req.systemPrompt ? `${req.systemPrompt}\n\n` : '') + req.userPrompt,
        stream: false,
        format: req.jsonMode ? 'json' : undefined,
        options: {
          temperature: req.temperature ?? 0.2,
          num_predict: req.maxTokens ?? config.aiMaxTokens,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    return data.response || '';
  }
}

/**
 * OpenAI Cloud Provider (Optional)
 */
export class OpenAIProvider implements LLMProvider {
  name = 'openai';

  async isAvailable(): Promise<boolean> {
    return Boolean(config.openaiApiKey);
  }

  async generateText(req: LLMRequest): Promise<string> {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    });

    const messages: any[] = [];
    if (req.systemPrompt) {
      messages.push({ role: 'system', content: req.systemPrompt });
    }
    messages.push({ role: 'user', content: req.userPrompt });

    const completion = await client.chat.completions.create({
      model: config.aiModel || 'gpt-4o-mini',
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? config.aiMaxTokens,
      response_format: req.jsonMode ? { type: 'json_object' } : undefined,
    });

    return completion.choices[0]?.message?.content || '';
  }
}

/**
 * Resilient AI Provider Orchestrator
 * Coordinates provider selection, schema validation, retry, and deterministic fallback.
 */
export class ResilientAIProvider {
  private local = new LocalDeterministicProvider();
  private ollama = new OllamaProvider();
  private openai = new OpenAIProvider();

  public async getActiveProvider(): Promise<LLMProvider> {
    if (config.aiProvider === 'ollama') {
      if (await this.ollama.isAvailable()) return this.ollama;
    } else if (config.aiProvider === 'openai') {
      if (await this.openai.isAvailable()) return this.openai;
    }

    // Auto-detect available providers
    if (await this.ollama.isAvailable()) return this.ollama;
    if (await this.openai.isAvailable()) return this.openai;

    return this.local;
  }

  /**
   * Safely execute structured JSON completion with automated retry and fallback.
   */
  public async executeStructured<T>(
    req: LLMRequest,
    validator: (data: any) => T | null,
    fallbackGenerator: () => T
  ): Promise<T> {
    const provider = await this.getActiveProvider();

    if (provider.name === 'local_deterministic') {
      return fallbackGenerator();
    }

    // Attempt 1: Call configured provider
    try {
      const rawText = await provider.generateText({ ...req, jsonMode: true });
      const parsed = this.cleanAndParseJSON(rawText);
      const validated = validator(parsed);
      if (validated !== null) return validated;
    } catch (err: any) {
      console.warn(`[AIProvider] Attempt 1 with ${provider.name} failed: ${err.message}`);
    }

    // Attempt 2: Strict retry with simplified prompt
    try {
      const retryReq: LLMRequest = {
        ...req,
        userPrompt: `${req.userPrompt}\n\nCRITICAL: Respond ONLY with valid, raw RFC-8259 JSON. No markdown, no commentary, no backticks.`,
        temperature: 0.1,
      };
      const rawText = await provider.generateText(retryReq);
      const parsed = this.cleanAndParseJSON(rawText);
      const validated = validator(parsed);
      if (validated !== null) return validated;
    } catch (err: any) {
      console.warn(`[AIProvider] Attempt 2 with ${provider.name} failed: ${err.message}`);
    }

    // Graceful fallback to deterministic logic
    return fallbackGenerator();
  }

  private cleanAndParseJSON(raw: string): any {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(cleaned);
  }
}

export const aiProviderService = new ResilientAIProvider();
