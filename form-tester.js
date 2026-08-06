// form-tester.js
// QA / load-testing harness. Runs one or more "jobs" (e.g. different quiz variants),
// each doing N submissions across parallel browser contexts ("tabs"), with pacing,
// retries, per-job logging, and an optional daily loop.
//
// Setup:
//   npm init -y
//   npm i playwright
//   npx playwright install chromium
//   node form-tester.js
//
// Point this at STAGING / your own test store, not live production traffic.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resolveValue = (v, ctx) => (typeof v === "function" ? v(ctx) : v);
const logResult = (p, e) => fs.appendFileSync(p, JSON.stringify(e) + "\n");

// per-job/global setting resolver
const setting = (job, key, dflt) => (job[key] ?? config[key] ?? dflt);

// ---------- step engine ----------
async function runStep(page, step, ctx) {
  const timeout = step.timeout ?? config.stepTimeoutMs ?? 15000;

  switch (step.action) {
    case "goto":
      await page.goto(resolveValue(step.url, ctx), { waitUntil: "domcontentloaded", timeout });
      break;
    case "click":
      await page.click(step.selector, { timeout });
      break;
    case "fill":
      await page.fill(step.selector, String(resolveValue(step.value, ctx)), { timeout });
      break;
    case "select":
      await page.selectOption(step.selector, String(resolveValue(step.value, ctx)), { timeout });
      break;
    case "check":
      await page.check(step.selector, { timeout });
      break;
    case "uncheck":
      await page.uncheck(step.selector, { timeout });
      break;
    case "press":
      await page.press(step.selector, String(resolveValue(step.value, ctx)), { timeout });
      break;
    case "waitForSelector":
      await page.waitForSelector(step.selector, { state: step.state ?? "visible", timeout });
      break;
    case "waitForTimeout":
      await page.waitForTimeout(Number(resolveValue(step.value, ctx)));
      break;
    case "waitForURL":
      await page.waitForURL(resolveValue(step.value, ctx), { timeout });
      break;
    case "uploadFile":
      await page.setInputFiles(step.selector, resolveValue(step.value, ctx));
      break;
    case "quizLoop": {
      // Repeatedly: pick an answer -> advance -> until the result/done element appears.
      const maxQuestions = step.maxQuestions ?? 20;
      const settleMs = step.settleMs ?? 600;

      for (let q = 0; q < maxQuestions; q++) {
        if (step.doneSelector) {
          const done = await page.$(step.doneSelector);
          if (done && (await done.isVisible())) break;
        }

        await page.waitForSelector(step.optionSelector, { state: "visible", timeout });
        const options = await page.$$(step.optionSelector);
        const visible = [];
        for (const o of options) if (await o.isVisible()) visible.push(o);
        if (visible.length === 0) break;

        // step.answers[q]: number=index | string=text match | function=(ctx,q,texts)=>index | undefined=random
        let choice = null;
        const plan = step.answers ? step.answers[q] : undefined;

        if (typeof plan === "number") {
          choice = visible[plan] ?? null;
        } else if (typeof plan === "string") {
          const target = plan.trim().toLowerCase();
          for (const o of visible) {
            const t = ((await o.textContent()) || "").trim().toLowerCase();
            if (t.includes(target)) { choice = o; break; }
          }
        } else if (typeof plan === "function") {
          const texts = [];
          for (const o of visible) texts.push(((await o.textContent()) || "").trim());
          choice = visible[plan(ctx, q, texts)] ?? null;
        }

        if (!choice) {
          if (plan !== undefined && step.strict) {
            throw new Error(`quizLoop: no option matched answer for question ${q} (${JSON.stringify(plan)})`);
          }
          choice = visible[Math.floor(Math.random() * visible.length)];
        }

        await choice.click();

        if (step.nextSelector) {
          const next = await page.$(step.nextSelector);
          if (next && (await next.isVisible()) && (await next.isEnabled())) await next.click();
        }
        await page.waitForTimeout(settleMs);
      }
      break;
    }
    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

// One full submission through a job's steps, with retries.
async function runSubmission(browser, job, index, logPath) {
  const attempts = (setting(job, "retriesPerSubmission", 1)) + 1;
  let lastErr;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const ctx = { job: job.name, index, attempt, now: new Date() };
    const startedAt = Date.now();

    try {
      for (const step of job.steps) await runStep(page, step, ctx);
      const entry = { job: job.name, index, attempt, ok: true, ms: Date.now() - startedAt, at: new Date().toISOString() };
      logResult(logPath, entry);
      await context.close();
      return entry;
    } catch (err) {
      lastErr = err;
      try {
        const dir = path.join(process.cwd(), "failures");
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${job.name}-${index}-a${attempt}.png`) });
      } catch (_) {}
      await context.close();
      if (attempt < attempts) await sleep(setting(job, "retryDelayMs", 1500));
    }
  }

  const entry = { job: job.name, index, ok: false, error: String(lastErr?.message ?? lastErr), at: new Date().toISOString() };
  logResult(logPath, entry);
  return entry;
}

// Run a single job to completion (its own concurrency pool + pacing).
async function runJob(browser, job, dateStamp) {
  const total = job.total ?? 300;
  const concurrency = setting(job, "concurrency", 3);
  const pacing = process.env.PACING ?? setting(job, "pacing", "burst");
  const gapMs = pacing === "spread"
    ? Math.max(0, Math.floor(setting(job, "spreadWindowMs", 8 * 3600 * 1000) / total))
    : 0;

  const logPath = path.join(process.cwd(), `results-${dateStamp}-${job.name}.jsonl`);
  console.log(`\n== Job "${job.name}" | ${total} submissions | concurrency ${concurrency} | pacing ${pacing}`);
  console.log(`   log: ${logPath}`);

  let dispatched = 0, ok = 0, fail = 0;

  async function worker(id) {
    while (true) {
      const index = dispatched++;
      if (index >= total) break;
      if (gapMs > 0 && index > 0) await sleep(gapMs);
      const res = await runSubmission(browser, job, index, logPath);
      res.ok ? ok++ : fail++;
      process.stdout.write(`\r   [${job.name}] ${ok + fail}/${total}  ok:${ok}  fail:${fail}   `);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, (_, i) => worker(i + 1)));
  console.log(`\n   done "${job.name}" -> ok:${ok} fail:${fail}`);
  return { job: job.name, ok, fail, total };
}

// Run every job once.
async function runAllJobs() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const browser = await chromium.launch({ headless: config.headless ?? true });
  const summaries = [];
  try {
    for (const job of config.jobs) summaries.push(await runJob(browser, job, dateStamp));
  } finally {
    await browser.close();
  }
  const totalOk = summaries.reduce((s, j) => s + j.ok, 0);
  const totalFail = summaries.reduce((s, j) => s + j.fail, 0);
  console.log(`\n=== Cycle complete (${dateStamp}) — total ok:${totalOk} fail:${totalFail} across ${summaries.length} job(s) ===`);
}

function msUntilNextRun(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

async function main() {
  // RUN_ONCE=1 forces a single run (used by GitHub Actions, where cron handles the daily trigger).
  if (!config.daily || process.env.RUN_ONCE) {
    await runAllJobs();
    return;
  }
  // Built-in daily loop: run now, then wait until dailyAtHour each following day.
  console.log(`Daily mode ON — will re-run every day at ${config.dailyAtHour ?? 9}:00. Keep this process running.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runAllJobs();
    const waitMs = msUntilNextRun(config.dailyAtHour ?? 9);
    const hrs = (waitMs / 3600000).toFixed(1);
    console.log(`\nSleeping ~${hrs}h until next daily run...\n`);
    await sleep(waitMs);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
