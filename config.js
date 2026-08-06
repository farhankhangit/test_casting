// config.js — Calmerceuticals Skin Quiz (test store), two answer-paths, 300 each = 600/day
//
// Store: https://test-by-farhan.myshopify.com/
//
// ============================================================================
// YOU MUST FILL 2 THINGS from the live quiz (I can't reach your store to read
// the DOM). Open the quiz in Chrome, right-click an answer card -> Inspect:
//   1) QUIZ_URL          -> the exact page the quiz lives on
//   2) OPTION_SELECTOR   -> a CSS selector that matches ONE answer card
//                           (find the common class on each option, e.g. ".quiz-option",
//                            "button[data-answer]", ".skin-quiz__option" ... whatever it is)
// Optional:
//   3) DONE_SELECTOR     -> something that appears on the final result screen
//      (not required — the loop auto-stops when no more questions appear)
//
// The quiz auto-advances on click (no "Next" button in the screenshots), so
// nextSelector is intentionally omitted.
// ============================================================================

const QUIZ_URL = "https://calmerceuticals.com/pages/questionnaire"; // set the real path if different
// All 18 screens live in the DOM at once (hidden via CSS), so we scope to the ACTIVE one only.
const OPTION_SELECTOR = ".screen.active [data-pick]"; // options on the current question
const NEXT_SELECTOR = ".screen.active .btn-next";     // "Continue" button on the current question

// The "FREE GIFT" marketing popup overlays the quiz — dismiss it whenever it appears.
const DISMISS_TEXTS = ["like free gifts"];  // the "I don't like free gifts" link (apostrophe-safe substring)
const DISMISS_SELECTORS = [];               // add the popup's × close button selector here if the link isn't reliable

module.exports = {
  concurrency: 4,
  headless: true,             // set false the first time to WATCH it pick answers
  retriesPerSubmission: 1,
  retryDelayMs: 1500,
  stepTimeoutMs: 15000,
  pacing: "spread",
  spreadWindowMs: 8 * 60 * 60 * 1000,

  daily: true,
  dailyAtHour: 9,

  jobs: [
    {
      name: "path-a-3544-hair",
      total: 30,   // per-run batch (buffer); daily cap below stops at 300
      dailyTarget: 300,   // real submissions/day cap for this job
      steps: [
        { action: "goto", url: QUIZ_URL },
        // If the quiz is behind a "Start" button or popup, uncomment & set it:
        // { action: "click", selector: "button.quiz-start" },
        {
          action: "quizLoop",
          optionSelector: OPTION_SELECTOR,
          nextSelector: NEXT_SELECTOR,   // click "Continue" after each pick
          dismissTexts: DISMISS_TEXTS,
          dismissSelectors: DISMISS_SELECTORS,
          maxQuestions: 2,   // sirf age + concern, phir ruk jao
          settleMs: 700,             // let the card transition finish
          questionTimeoutMs: 5000,   // how long to wait before deciding "quiz finished"
          strict: true,              // throw if a specified answer text isn't found (catches typos)
          // Q1 = age, Q2 = concern. Matched by visible text (dash-free subtitle for age).
          answers: ["Decline begins", "Hair and nails"],
          // ^ questions 3+ are unspecified -> random. Add more entries to pin them.
        },
        // If the quiz ends with an email capture / submit that actually records the entry,
        // include it here so a "submission" really counts:
        // { action: "fill",  selector: 'input[type="email"]', value: (ctx) => `qa+${ctx.job}-${ctx.index}@example.com` },
        // { action: "click", selector: "button[type=submit]" },
        // { action: "waitForSelector", selector: DONE_SELECTOR, state: "visible" },
      ],
    },
    {
      name: "path-b-4554-body",
      total: 30,   // per-run batch (buffer); daily cap below stops at 300
      dailyTarget: 300,   // real submissions/day cap for this job
      steps: [
        { action: "goto", url: QUIZ_URL },
        {
          action: "quizLoop",
          optionSelector: OPTION_SELECTOR,
          nextSelector: NEXT_SELECTOR,
          dismissTexts: DISMISS_TEXTS,
          dismissSelectors: DISMISS_SELECTORS,
          maxQuestions: 2,   // sirf age + concern, phir ruk jao
          settleMs: 700,
          questionTimeoutMs: 5000,
          strict: true,
          answers: ["Critical window", "skin looseness"],
        },
        // (same optional email/submit block as above if applicable)
      ],
    },
  ],
};