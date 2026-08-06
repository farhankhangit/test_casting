// report.js
// Reads every results-*.jsonl in this folder and builds:
//   - a console summary
//   - report.html (open in any browser)
//
// Run after a test run:  node report.js

const fs = require("fs");
const path = require("path");

const files = fs.readdirSync(process.cwd())
  .filter((f) => /^results-.*\.jsonl$/.test(f));

if (files.length === 0) {
  console.log("No results-*.jsonl files found. Run form-tester.js first.");
  process.exit(0);
}

// Parse all entries.
const entries = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(process.cwd(), f), "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch (_) {}
  }
}

const dateOf = (e) => (e.at || "").slice(0, 10) || "unknown";
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// Group by date + job.
const groups = {};
for (const e of entries) {
  const key = `${dateOf(e)}::${e.job || "?"}`;
  (groups[key] ||= { date: dateOf(e), job: e.job || "?", ok: 0, fail: 0, ms: [], errors: {} });
  const g = groups[key];
  if (e.ok) { g.ok++; if (typeof e.ms === "number") g.ms.push(e.ms); }
  else { g.fail++; const msg = (e.error || "unknown").slice(0, 120); g.errors[msg] = (g.errors[msg] || 0) + 1; }
}

const rows = Object.values(groups).sort((a, b) =>
  a.date === b.date ? a.job.localeCompare(b.job) : b.date.localeCompare(a.date)
);

// ---- console summary ----
console.log(`\nParsed ${entries.length} submissions from ${files.length} file(s).\n`);
for (const r of rows) {
  const total = r.ok + r.fail;
  const rate = total ? ((r.ok / total) * 100).toFixed(1) : "0.0";
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  console.log(`${r.date}  ${r.job}`);
  console.log(`   total ${total} | ok ${r.ok} | fail ${r.fail} | success ${rate}% | avg ${avg}ms | median ${median(r.ms)}ms`);
  const errs = Object.entries(r.errors).sort((a, b) => b[1] - a[1]);
  if (errs.length) errs.slice(0, 3).forEach(([m, c]) => console.log(`     ✗ ${c}x  ${m}`));
}

// ---- HTML report ----
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cards = rows.map((r) => {
  const total = r.ok + r.fail;
  const rate = total ? (r.ok / total) * 100 : 0;
  const avg = r.ms.length ? Math.round(r.ms.reduce((a, b) => a + b, 0) / r.ms.length) : 0;
  const bar = rate >= 98 ? "#16a34a" : rate >= 90 ? "#d97706" : "#dc2626";
  const errs = Object.entries(r.errors).sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `<li><span class="c">${c}×</span> ${esc(m)}</li>`).join("");
  return `
  <div class="card">
    <div class="head"><h2>${esc(r.job)}</h2><span class="date">${esc(r.date)}</span></div>
    <div class="rate"><div class="track"><div class="fill" style="width:${rate.toFixed(1)}%;background:${bar}"></div></div><b>${rate.toFixed(1)}%</b></div>
    <div class="grid">
      <div><span>Total</span><b>${total}</b></div>
      <div><span>OK</span><b class="ok">${r.ok}</b></div>
      <div><span>Fail</span><b class="fail">${r.fail}</b></div>
      <div><span>Avg</span><b>${avg} ms</b></div>
      <div><span>Median</span><b>${median(r.ms)} ms</b></div>
    </div>
    ${errs ? `<details><summary>Errors</summary><ul>${errs}</ul></details>` : ""}
  </div>`;
}).join("");

const html = `<!doctype html><meta charset="utf-8"><title>Quiz QA Report</title>
<style>
  :root{font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  body{margin:0;background:#f6f5f3;color:#1a1a1a;padding:32px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#777;font-size:13px;margin-bottom:24px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
  .card{background:#fff;border:1px solid #e7e5e1;border-radius:14px;padding:18px}
  .head{display:flex;justify-content:space-between;align-items:baseline}
  .head h2{font-size:15px;margin:0} .date{color:#999;font-size:12px}
  .rate{display:flex;align-items:center;gap:10px;margin:14px 0}
  .track{flex:1;height:8px;background:#eee;border-radius:99px;overflow:hidden}
  .fill{height:100%} .rate b{font-variant-numeric:tabular-nums;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:6px}
  .grid div{background:#faf9f7;border-radius:8px;padding:8px;text-align:center}
  .grid span{display:block;color:#999;font-size:11px;margin-bottom:2px}
  .grid b{font-size:14px;font-variant-numeric:tabular-nums}
  .ok{color:#16a34a}.fail{color:#dc2626}
  details{margin-top:12px;font-size:12px} summary{cursor:pointer;color:#666}
  ul{margin:8px 0 0;padding-left:16px} li{margin:3px 0} .c{color:#dc2626;font-weight:600}
</style>
<h1>Quiz QA Report</h1>
<div class="sub">Generated ${new Date().toLocaleString()} · ${entries.length} submissions · ${files.length} file(s)</div>
<div class="cards">${cards}</div>`;

fs.writeFileSync(path.join(process.cwd(), "report.html"), html);
console.log(`\nHTML report written -> ${path.join(process.cwd(), "report.html")}\n`);
