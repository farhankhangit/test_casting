// config.js — two quiz variants, 300 each = 600/day
// Edit selectors + answers to match your quizzes. Runner (form-tester.js) stays untouched.
//
// ---- Daily scheduling ----
// Easiest (cross-platform, zero setup): set daily:true below and just leave
//   `node form-tester.js` running. It runs both jobs now, then again each day at dailyAtHour.
//
// More robust (survives reboots/crashes) — set daily:false and schedule the OS instead:
//   macOS/Linux cron (run 9:00 AM daily):
//     0 9 * * *  cd /path/to/project && /usr/bin/node form-tester.js >> run.log 2>&1
//   Windows Task Scheduler:
//     Program: node    Arguments: form-tester.js    Start in: C:\path\to\project    Trigger: Daily 9:00 AM

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const fakeEmail = (ctx) => `qa+${ctx.job}-${ctx.index}-${digits(4)}@example.com`;

// ---- shared defaults (each job can override any of these) ----
module.exports = {
  concurrency: 4,             // parallel "tabs"
  headless: true,             // false to watch it run while verifying selectors
  retriesPerSubmission: 1,
  retryDelayMs: 1500,
  stepTimeoutMs: 15000,
  pacing: "spread",           // "spread" = gentle across the window | "burst" = as fast as possible
  spreadWindowMs: 8 * 60 * 60 * 1000,

  // ---- daily loop ----
  daily: true,                // true = built-in loop reruns every day (keep process running)
  dailyAtHour: 9,             // 24h clock, local time

  // ---- the two quiz variants ----
  jobs: [
    {
      name: "quiz-a",
      total: 300,
      steps: [
        { action: "goto", url: "https://your-staging-store.myshopify.com/pages/quiz-a" },
        {
          action: "quizLoop",
          optionSelector: ".quiz-answer",
          nextSelector: "button.quiz-next",   // omit if selecting auto-advances
          doneSelector: ".quiz-result",
          maxQuestions: 15,
          settleMs: 600,
          strict: true,                        // error if a chosen answer isn't found
          answers: [1, "Yes", 0, "Improve sleep", (ctx, q, t) => t.length - 1],
        },
        // { action: "fill",  selector: 'input[name="email"]', value: (ctx) => fakeEmail(ctx) },
        // { action: "click", selector: "button.quiz-submit" },
        { action: "waitForSelector", selector: ".quiz-result", state: "visible" },
      ],
    },
    {
      name: "quiz-b",
      total: 300,
      steps: [
        { action: "goto", url: "https://your-staging-store.myshopify.com/pages/quiz-b" },
        {
          action: "quizLoop",
          optionSelector: ".quiz-answer",
          nextSelector: "button.quiz-next",
          doneSelector: ".quiz-result",
          maxQuestions: 15,
          settleMs: 600,
          strict: true,
          answers: ["No", 2, "Reduce stress", 0],
        },
        { action: "waitForSelector", selector: ".quiz-result", state: "visible" },
      ],
    },
  ],
};
