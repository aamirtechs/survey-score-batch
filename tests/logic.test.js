"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("../src/logic.js");

test("NPS computation with promoter passive detractor split", () => {
  // 4 promoters, 2 passives, 4 detractors = 40 - 40 = 0
  const s = L.summarize([10, 10, 9, 9, 8, 7, 6, 5, 0, 2], "nps");
  assert.strictEqual(s.n, 10);
  assert.strictEqual(s.promoters, 4);
  assert.strictEqual(s.passives, 2);
  assert.strictEqual(s.detractors, 4);
  assert.strictEqual(s.score, 0);
  const good = L.summarize([10, 10, 10, 9, 8], "nps");
  assert.strictEqual(good.score, 80);
});

test("CSAT computation as satisfied share", () => {
  const s = L.summarize([5, 5, 4, 3, 1], "csat");
  assert.strictEqual(s.score, 60); // 3 of 5 rated 4 or 5
  assert.strictEqual(s.satisfied, 3);
  assert.strictEqual(s.mean, 3.6);
});

test("CES computation as easy share on 1-7", () => {
  const s = L.summarize([7, 6, 5, 4, 2], "ces");
  assert.strictEqual(s.score, 60); // 3 of 5 rated 5 or more
  assert.strictEqual(s.easy, 3);
});

test("score column auto detection by scale and header", () => {
  assert.strictEqual(L.inferScoreType([0, 5, 10], "score"), "nps");
  assert.strictEqual(L.inferScoreType([1, 3, 5], "rating"), "csat");
  assert.strictEqual(L.inferScoreType([1, 4, 7], "rating"), "ces");
  assert.strictEqual(L.inferScoreType([1, 3, 5], "csat_satisfaction"), "csat");
  assert.strictEqual(L.inferScoreType([2, 6], "effort_score"), "ces");
  const rows = [{ agent: "A", nps_score: "10" }, { agent: "B", nps_score: "3" }];
  const det = L.detectScoreColumn(["agent", "nps_score"], rows);
  assert.strictEqual(det.column, "nps_score");
  assert.strictEqual(det.type, "nps");
});

test("95 percent confidence interval narrows with sample size", () => {
  const small = L.summarize([5, 5, 4, 5, 1], "csat");
  const bigScores = [];
  for (let i = 0; i < 100; i++) { bigScores.push(i % 5 === 0 ? 2 : 5); }
  const big = L.summarize(bigScores, "csat");
  assert.ok(small.ciHalfWidth > big.ciHalfWidth, small.ciHalfWidth + " vs " + big.ciHalfWidth);
  assert.strictEqual(small.score, 80);
  assert.ok(Math.abs(small.ciLow - 44.94) < 0.1, "ciLow " + small.ciLow);
});

test("sample size warning under 30 responses", () => {
  const s = L.summarize([10, 9, 10], "nps");
  assert.ok(s.warning && s.warning.indexOf("30") !== -1);
  const many = [];
  for (let i = 0; i < 40; i++) { many.push(9); }
  assert.strictEqual(L.summarize(many, "nps").warning, null);
});

test("group by segmentation and month buckets", () => {
  const rows = [
    { agent: "A", score: "10", date: "2026-01-05" },
    { agent: "A", score: "9", date: "2026-01-20" },
    { agent: "B", score: "2", date: "2026-02-01" },
    { agent: "B", score: "10", date: "2026-02-11" }
  ];
  const segs = L.groupSummaries(rows, "score", "nps", "agent", false);
  assert.strictEqual(segs.length, 2);
  assert.strictEqual(segs[0].segment, "A");
  assert.strictEqual(segs[0].score, 100);
  assert.strictEqual(segs[1].score, 0);
  assert.strictEqual(L.monthBucket("2026-02-11"), "2026-02");
  const byMonth = L.groupSummaries(rows, "score", "nps", "date", true);
  assert.deepStrictEqual(byMonth.map(s => s.segment), ["2026-01", "2026-02"]);
});

test("analyzeCSV end to end with summary export", () => {
  const csv = "agent,channel,score\nA,chat,10\nA,email,9\nB,chat,1\nB,email,8";
  const a = L.analyzeCSV(csv, { groupColumn: "channel" });
  assert.strictEqual(a.scoreColumn, "score");
  assert.strictEqual(a.type, "nps");
  assert.strictEqual(a.overall.n, 4);
  assert.strictEqual(a.segments.length, 2);
  assert.ok(L.buildSummaryCSV(a).includes("OVERALL"));
});
