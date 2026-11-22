import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

test("falls through to the next Gemini model when one is overloaded", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  delete process.env.GROQ_API_KEY;
  const called: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const model = String(url).match(/models\/([^:]+):/)?.[1] ?? "";
    called.push(model);
    if (model === "gemini-flash-latest") return new Response("busy", { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  }) as typeof fetch;
  try {
    const { llmJson } = await import("../src/lib/llm");
    const out = await llmJson("hi", z.object({ ok: z.boolean() }));
    assert.deepEqual(out, { ok: true });
    assert.equal(called.at(-1), "gemini-flash-lite-latest");
    assert.ok(called.filter((m) => m === "gemini-flash-latest").length >= 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
