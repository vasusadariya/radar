/**
 * Cron entrypoint: `npm run ingest:funding`. Runs from GitHub Actions every 3 hours,
 * or locally any time.
 */
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

async function main() {
  // Imported after env is loaded: the db module reads DATABASE_URL at import time.
  const { closeDb } = await import("@/db");
  const { llmJson } = await import("@/lib/llm");
  const { getProfile } = await import("@/lib/profile");
  const { feedsFromEnv } = await import("@/worker/feeds");
  const { ingestFunding } = await import("@/worker/funding");

  const started = Date.now();
  try {
    const stats = await ingestFunding({
      feeds: feedsFromEnv(),
      llm: llmJson,
      profile: await getProfile(),
      log: (m) => console.log(m),
    });
    console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(1)}s`, JSON.stringify(stats, null, 2));
    if (stats.feedsOk === 0) process.exitCode = 1; // every feed failed — make the Action go red
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
