import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

test("falls through to the next Gemini model when one is overloaded", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  delete process.env.GROQ_API_KEY;
  const called: string[] = [];
  const bodies: Array<Record<string, unknown>> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const model = String(url).match(/models\/([^:]+):/)?.[1] ?? "";
    called.push(model);
    if (model === "gemini-flash-lite-latest") return new Response("busy", { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  }) as typeof fetch;
  try {
    const { llmJson } = await import("../src/lib/llm");
    const out = await llmJson("hi", z.object({ ok: z.boolean() }));
    assert.deepEqual(out, { ok: true });
    assert.equal(called.at(-1), "gemini-3.5-flash-lite", "falls to the next lite model");
    assert.ok(called.filter((m) => m === "gemini-flash-lite-latest").length >= 1);
    const cfg = bodies[0].generationConfig as { responseJsonSchema?: { required?: string[] } };
    assert.deepEqual(cfg.responseJsonSchema?.required, ["ok"], "schema is sent to Gemini");
  } finally {
    globalThis.fetch = realFetch;
  }
});
