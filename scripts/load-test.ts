import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

type Metrics = {
  queue: {
    active: number;
    waiting: number;
    maxConcurrent: number;
    maxBacklog: number;
    rejected: number;
    completed: number;
    failed: number;
    ffmpegActive: number;
    ffmpegWaiting: number;
    maxFfmpegSlots: number;
    loadTestFfmpegPeakRssBytes: number;
  };
  database: { totalConnections: number; idleConnections: number; waitingRequests: number };
  memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; externalBytes: number };
};

type Record = {
  operation: string;
  status: number;
  durationMs: number;
  error?: string;
  expectedQueueRejection?: boolean;
};

type Scenario = {
  name: string;
  requestCount: number;
  records: Record[];
  metrics: Metrics[];
};

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:5001").replace(/\/$/, "");
const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`.toLowerCase();
const fixturePath = process.env.LOAD_TEST_FIXTURE ?? path.join(process.cwd(), "public", "favicon-512.png");
const requestedStoreCount = Number.parseInt(process.env.LOAD_TEST_STORES ?? "12", 10);
if (requestedStoreCount !== 12) {
  throw new Error("LOAD_TEST_STORES must be exactly 12 so the chain-launch scenario stays repeatable.");
}
const storeCount = 12;
const heavyRequestCount = 100;
const sampleDurationMs = Number.parseInt(process.env.LOAD_TEST_SAMPLE_MS ?? "1800", 10);
const sampleIntervalMs = 50;
const queueDrainTimeoutMs = 120_000;
const testEmailPattern = "load-test-%@loadtest.invalid";

let fixture: Buffer;

function token(id: string) {
  return `load-test:${runId}-${id}`.slice(0, 90);
}

function headers(id: string) {
  return { Authorization: `Bearer ${token(id)}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(operation: string, url: string, init: RequestInit, expectedQueueRejection = false): Promise<{ record: Record; body: any }> {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${url}`, init);
    const body = await response.json().catch(() => ({}));
    const record: Record = {
      operation,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      expectedQueueRejection,
    };
    if (!response.ok && !(expectedQueueRejection && response.status === 429)) {
      record.error = typeof body?.message === "string" ? body.message : `HTTP ${response.status}`;
    }
    return { record, body };
  } catch (error: any) {
    return {
      record: {
        operation,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        error: error?.message ?? "Network error",
        expectedQueueRejection,
      },
      body: {},
    };
  }
}

async function metrics(): Promise<Metrics> {
  const response = await fetch(`${baseUrl}/api/load-test/metrics`);
  if (!response.ok) {
    throw new Error(`Load-test metrics endpoint unavailable (${response.status}). Start the server with NODE_ENV=test and LOAD_TEST_MODE=1.`);
  }
  return response.json();
}

function imageForm(field: "image" | "images", count = 1) {
  const form = new FormData();
  for (let i = 0; i < count; i++) {
    form.append(field, new Blob([fixture], { type: "image/png" }), `load-test-${i}.png`);
  }
  return form;
}

async function login(id: string) {
  return request("login / auth verify", "/api/auth/verify", {
    method: "POST",
    headers: { ...headers(id), "Content-Type": "application/json", "x-lang": "da" },
    body: JSON.stringify({ lang: "da" }),
  });
}

async function createCase(id: string, suffix: string) {
  return request("case create", "/api/bolig/cases", {
    method: "POST",
    headers: { ...headers(id), "Content-Type": "application/json" },
    body: JSON.stringify({
      address: `Load test ${suffix}, 1000 København`,
      caseNo: `${runId.slice(-8)}-${suffix}`,
      notes: "Synthetic capacity test data",
    }),
  });
}

async function saveCaseImage(id: string, caseId: number) {
  return request("case image save", `/api/bolig/cases/${caseId}/images`, {
    method: "POST",
    headers: { ...headers(id), "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: "/uploads/load-test-placeholder.png",
      originalImageUrl: "/uploads/load-test-placeholder.png",
      roomType: "living room",
      style: "scandinavian",
      budgetTier: "tier2",
      promptText: "Synthetic source image record",
    }),
  });
}

async function submitAiImage(id: string, caseId: number) {
  const form = imageForm("image");
  form.append("caseId", String(caseId));
  form.append("room", "living room");
  form.append("style", "scandinavian");
  form.append("tier", "tier2");
  return request("image upload + AI submit", "/api/bolig/generate", {
    method: "POST",
    headers: headers(id),
    body: form,
  });
}

async function submitFloorplan(id: string) {
  return request("3D floorplan submit", "/api/bolig/floorplan-3d", {
    method: "POST",
    headers: headers(id),
    body: imageForm("image"),
  });
}

async function submitShowcase(id: string, expectedQueueRejection = false) {
  const form = imageForm("images", 2);
  form.append("address", "Load testvej 1, 1000 København");
  form.append("ratio", "portrait");
  form.append("presetKeys", JSON.stringify(["DEFAULT", "DEFAULT"]));
  form.append("vfxKeys", JSON.stringify([null, null]));
  form.append("lang", "da");
  return request("showcase video submit", "/api/bolig/showcase-video", {
    method: "POST",
    headers: headers(id),
    body: form,
  }, expectedQueueRejection);
}

async function waitForQueueToDrain(samples: Metrics[]) {
  const deadline = Date.now() + queueDrainTimeoutMs;
  while (Date.now() < deadline) {
    const current = await metrics();
    samples.push(current);
    if (current.queue.active === 0 && current.queue.waiting === 0) return;
    await sleep(sampleIntervalMs);
  }
  throw new Error("Showcase queue did not drain within two minutes in test mode.");
}

async function sampleWhile<T>(work: Promise<T>, samples: Metrics[]): Promise<T> {
  let done = false;
  const sampler = (async () => {
    const deadline = Date.now() + sampleDurationMs;
    while (!done || Date.now() < deadline) {
      samples.push(await metrics());
      await sleep(sampleIntervalMs);
    }
  })();
  try {
    return await work;
  } finally {
    done = true;
    await sampler;
  }
}

async function multiStoreBurst(): Promise<Scenario> {
  const samples: Metrics[] = [await metrics()];
  const work = Promise.all(
    Array.from({ length: storeCount }, async (_, index) => {
      const id = `store-${index}`;
      const records: Record[] = [];
      const signedIn = await login(id);
      records.push(signedIn.record);
      const created = await createCase(id, `store-${index}`);
      records.push(created.record);
      const caseId = Number(created.body?.id);
      if (!Number.isInteger(caseId)) return records;
      records.push((await saveCaseImage(id, caseId)).record);
      records.push((await submitAiImage(id, caseId)).record);
      records.push((await submitFloorplan(id)).record);
      records.push((await submitShowcase(id)).record);
      return records;
    }),
  );
  const records = (await sampleWhile(work, samples)).flat();
  await waitForQueueToDrain(samples);
  return { name: `${storeCount}-store simultaneous launch`, requestCount: records.length, records, metrics: samples };
}

async function heavyBurst(): Promise<Scenario> {
  const setup = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const id = `heavy-${index}`;
      const signedIn = await login(id);
      if (!signedIn.record.error) {
        const created = await createCase(id, `heavy-seed-${index}`);
        return { id, caseId: Number(created.body?.id) };
      }
      return { id, caseId: Number.NaN };
    }),
  );
  if (setup.some((item) => !Number.isInteger(item.caseId))) {
    throw new Error("Could not prepare authenticated load-test cases for the 100-request burst.");
  }

  const samples: Metrics[] = [await metrics()];
  const work: Array<Promise<{ record: Record; body: any }>> = [];
  for (const item of setup) work.push(login(item.id));
  // 20 logins plus 16 requests in each remaining flow is exactly 100 requests.
  // It gives every flow material contention while retaining an authentic mix.
  const mixed = setup.slice(0, 16);
  for (const item of mixed) work.push(createCase(item.id, `heavy-new-${item.id}`));
  for (const item of mixed) work.push(saveCaseImage(item.id, item.caseId));
  for (const item of mixed) work.push(submitAiImage(item.id, item.caseId));
  for (const item of mixed) work.push(submitFloorplan(item.id));
  for (const item of mixed) work.push(submitShowcase(item.id, true));

  const completed = await sampleWhile(Promise.all(work), samples);
  const records = completed.map((item) => item.record);
  await waitForQueueToDrain(samples);
  return { name: `${heavyRequestCount}-request mixed burst`, requestCount: records.length, records, metrics: samples };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function bytes(bytesValue: number) {
  return `${(bytesValue / 1024 / 1024).toFixed(1)} MB`;
}

function summarize(scenario: Scenario) {
  const byOperation = [...new Set(scenario.records.map((record) => record.operation))].map((operation) => {
    const records = scenario.records.filter((record) => record.operation === operation);
    const durations = records.map((record) => record.durationMs);
    const expectedRejections = records.filter((record) => record.expectedQueueRejection && record.status === 429).length;
    const failures = records.filter((record) => !!record.error).length;
    return {
      operation,
      count: records.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      failures,
      expectedRejections,
    };
  });
  const max = (values: number[]) => Math.max(...values, 0);
  return {
    byOperation,
    unexpectedErrors: scenario.records.filter((record) => !!record.error).length,
    queueRejected: max(scenario.metrics.map((metric) => metric.queue.rejected)) - scenario.metrics[0].queue.rejected,
    peakQueueActive: max(scenario.metrics.map((metric) => metric.queue.active)),
    peakQueueWaiting: max(scenario.metrics.map((metric) => metric.queue.waiting)),
    queueCompleted: max(scenario.metrics.map((metric) => metric.queue.completed)) - scenario.metrics[0].queue.completed,
    queueFailed: max(scenario.metrics.map((metric) => metric.queue.failed)) - scenario.metrics[0].queue.failed,
    peakPoolConnections: max(scenario.metrics.map((metric) => metric.database.totalConnections)),
    peakPoolWaiters: max(scenario.metrics.map((metric) => metric.database.waitingRequests)),
    peakRss: max(scenario.metrics.map((metric) => metric.memory.rssBytes)),
    peakHeap: max(scenario.metrics.map((metric) => metric.memory.heapUsedBytes)),
    peakFfmpegRss: max(scenario.metrics.map((metric) => metric.queue.loadTestFfmpegPeakRssBytes)),
  };
}

function report(scenarios: Scenario[]) {
  const summaries = scenarios.map(summarize);
  const lines = [
    "# Chain launch capacity report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Target: \`${baseUrl}\` (test-only server mode; no paid AI provider calls)`,
    `Fixture: \`${path.relative(process.cwd(), fixturePath)}\``,
    "",
    "## Coverage",
    "",
    "- Firebase-authenticated session verification (`/api/auth/verify`)",
    "- Bolig case creation and case-image persistence",
    "- Multipart source-image upload combined with AI-image submission (`/api/bolig/generate`)",
    "- Multipart 3D-floorplan submission (`/api/bolig/floorplan-3d`)",
    "- Multipart showcase-video submission (`/api/bolig/showcase-video`)",
    "",
  ];
  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];
    const summary = summaries[index];
    lines.push(`## ${scenario.name}`, "", `Requests measured: **${scenario.requestCount}**`, "");
    lines.push("| Operation | Requests | p50 | p95 | p99 | Unexpected errors | Expected 429s |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const item of summary.byOperation) {
      lines.push(`| ${item.operation} | ${item.count} | ${item.p50} ms | ${item.p95} ms | ${item.p99} ms | ${item.failures} | ${item.expectedRejections} |`);
    }
    lines.push(
      "",
      `- Queue: peak **${summary.peakQueueActive} active**, **${summary.peakQueueWaiting} waiting**; **${summary.queueCompleted}** completed, **${summary.queueFailed}** failed, and **${summary.queueRejected}** rejected at the configured backlog cap.`,
      `- Database pool: peak **${summary.peakPoolConnections} connections**, **${summary.peakPoolWaiters} waiting**.`,
      `- Memory: Node peak RSS **${bytes(summary.peakRss)}**; V8 heap used **${bytes(summary.peakHeap)}**; synthetic FFmpeg child peak RSS **${bytes(summary.peakFfmpegRss)}**.`,
      `- Unexpected HTTP/network errors: **${summary.unexpectedErrors}**.`,
      "",
    );
  }
  lines.push(
    "## Recommended launch guardrails",
    "",
    "- Use **at least 2 vCPU and 2 GB RAM** as the starting rollout size. This is a safety baseline for the observed Node and 1080×1920 FFmpeg workload, not a claim that paid-provider latency has been benchmarked.",
    "- Keep the existing showcase limit at **1 active render and 12 active-or-queued jobs per process**. Treat HTTP **429** from showcase submission as normal overload protection; surface retry guidance instead of retrying immediately.",
    "- Roll out in store cohorts no larger than **12 simultaneous showcase submissions per process**. AI image and 3D submissions can scale with normal web capacity, but showcase is the bottleneck.",
    "- Keep PostgreSQL pool contention at **0 waiting requests**. If it rises during staging tests, scale the app before raising the pool size.",
    "- Run this harness against an isolated staging database and test-only server mode before every major chain rollout. The test server refuses to expose its fake auth, provider stubs, or metrics endpoint in production.",
    "",
    "## Method",
    "",
    "The test mode preserves route authentication, request parsing, uploads, quota checks, database writes, the real showcase admission queue, and one 1-second 1080×1920 local FFmpeg encode per admitted showcase job. It skips Collov, fal.ai, Rendy, email, background trackers, provider warmups, and full multi-clip assembly. These numbers prove application/queue/database burst behavior and a representative local encode; they are not a benchmark for paid-provider generation time.",
    "",
  );
  return lines.join("\n");
}

async function cleanup() {
  if (process.env.LOAD_TEST_CLEANUP === "0") return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for load-test cleanup.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("BEGIN");
    await pool.query("DELETE FROM bolig_case_images WHERE case_id IN (SELECT id FROM bolig_cases WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))", [testEmailPattern]);
    await pool.query("DELETE FROM generated_images WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)", [testEmailPattern]);
    await pool.query("DELETE FROM video_jobs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)", [testEmailPattern]);
    await pool.query("DELETE FROM bolig_cases WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)", [testEmailPattern]);
    await pool.query("DELETE FROM users WHERE email LIKE $1", [testEmailPattern]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  fixture = await readFile(fixturePath);
  if (fixture.length === 0) throw new Error(`Fixture is empty: ${fixturePath}`);
  await metrics(); // Refuse a regular dev/prod server before creating any data.
  await cleanup();

  try {
    const scenarios = [await multiStoreBurst(), await heavyBurst()];
    const markdown = report(scenarios);
    await mkdir(path.join(process.cwd(), "reports"), { recursive: true });
    await writeFile(path.join(process.cwd(), "reports", "load-test-report.md"), markdown);
    console.log(markdown);

    const unexpected = scenarios.flatMap((scenario) => scenario.records).filter((record) => record.error);
    if (unexpected.length > 0) {
      throw new Error(`${unexpected.length} unexpected request failures; see reports/load-test-report.md`);
    }
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`Load test failed: ${error.message}`);
  process.exitCode = 1;
});