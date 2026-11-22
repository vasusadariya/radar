import { z } from "zod";

/**
 * Minimal JSON-mode LLM client over plain fetch (no SDKs to keep versions stable).
 * Gemini free tier is primary; Groq (OpenAI-compatible) is the fallback when
 * Gemini errors or rate-limits.
 */

export type LlmJson = <T>(prompt: string, schema: z.ZodType<T>) => Promise<T>;

// Tried in order: a busy (503) or retired (404) model falls through to the next.
// Lite first: fast and plenty for extraction; the bigger model is the fallback.
const GEMINI_MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean)),
];
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// An overloaded model can hold a request open for minutes; give up and fall through instead.
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(prompt: string, model: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) throw new LlmHttpError("gemini", res.status, await res.text());
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`gemini: empty response ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Reply with a single JSON object only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new LlmHttpError("groq", res.status, await res.text());
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("groq: empty response");
  return text;
}

class LlmHttpError extends Error {
  constructor(
    public provider: string,
    public status: number,
    body: string,
  ) {
    super(`${provider} HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}

async function withRetry(fn: () => Promise<string>, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof LlmHttpError && (err.status === 429 || err.status >= 500);
      if (!retryable || i === tries - 1) break;
      await sleep(2000 * 2 ** i);
    }
  }
  throw lastErr;
}

export const llmJson: LlmJson = async (prompt, schema) => {
  const providers: Array<[string, () => Promise<string>]> = [];
  if (process.env.GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) providers.push([model, () => withRetry(() => callGemini(prompt, model), 2)]);
  }
  if (process.env.GROQ_API_KEY) providers.push(["groq", () => withRetry(() => callGroq(prompt))]);
  if (providers.length === 0) throw new Error("No LLM configured: set GEMINI_API_KEY (or GROQ_API_KEY)");

  const errors: string[] = [];
  for (const [name, call] of providers) {
    try {
      const parsed = schema.safeParse(parseJson(await call()));
      if (parsed.success) return parsed.data;
      errors.push(`${name}: schema mismatch ${parsed.error.message.slice(0, 300)}`);
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`);
    }
  }
  throw new Error(`All LLM providers failed — ${errors.join(" | ")}`);
};
