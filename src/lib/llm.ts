import { z } from "zod";

/**
 * Minimal JSON-mode LLM client over plain fetch (no SDKs to keep versions stable).
 * Gemini free tier is primary; Groq (OpenAI-compatible) is the fallback when
 * Gemini errors or rate-limits.
 */

export type LlmJson = <T>(prompt: string, schema: z.ZodType<T>) => Promise<T>;

// Tried in order: a busy (503), retired (404) or off-schema model falls through to the next.
// Lite models first: fast, rarely overloaded, and enough for extraction and short drafts.
// (Nov 2026: the full-size flash models were returning 503 "high demand" most of the time.)
const GEMINI_MODELS = [
  ...new Set(
    [
      process.env.GEMINI_MODEL,
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ].filter((m): m is string => Boolean(m)),
  ),
];

/** JSON Schema for Gemini's structured output; null if the schema can't be expressed. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> | null {
  try {
    const js = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
    delete js.$schema;
    return requireAll(js) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Ask the model for every field (optional ones may still be null) and drop defaults it can't use. */
function requireAll(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(requireAll);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (k !== "default") out[k] = requireAll(v);
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.required = Object.keys(out.properties);
  }
  return out;
}

/** "people.0.name: expected string" — short enough to read in a log line. */
export function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// An overloaded model can hold a request open for minutes; give up and fall through instead.
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(prompt: string, model: string, schema: Record<string, unknown> | null): Promise<string> {
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
        generationConfig: {
          responseMimeType: "application/json",
          ...(schema ? { responseJsonSchema: schema } : {}),
          temperature: 0.2,
        },
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
  const js = jsonSchemaFor(schema);
  if (process.env.GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) providers.push([model, () => withRetry(() => callGemini(prompt, model, js), 2)]);
  }
  if (process.env.GROQ_API_KEY) providers.push(["groq", () => withRetry(() => callGroq(prompt))]);
  if (providers.length === 0) throw new Error("No LLM configured: set GEMINI_API_KEY (or GROQ_API_KEY)");

  const errors: string[] = [];
  for (const [name, call] of providers) {
    try {
      const raw = await call();
      const parsed = schema.safeParse(parseJson(raw));
      if (parsed.success) return parsed.data;
      errors.push(`${name}: off-schema (${describeIssues(parsed.error)}) raw=${raw.replace(/\s+/g, " ").slice(0, 160)}`);
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`);
    }
  }
  throw new Error(`All LLM providers failed — ${errors.join(" | ")}`);
};
