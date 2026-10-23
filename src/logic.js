"use strict";
// Survey Score Batch: core logic (pure functions, no DOM).

function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } }
      else { cur += c; }
    } else if (c === '"') { inQ = true; }
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else { cur += c; }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
  if (!clean.length) { return { headers: [], rows: [] }; }
  const headers = clean[0].map(function (h) { return String(h).trim(); });
  const out = clean.slice(1).map(function (r) {
    const o = {};
    headers.forEach(function (h, idx) { o[h] = r[idx] !== undefined ? String(r[idx]).trim() : ""; });
    return o;
  });
  return { headers: headers, rows: out };
}
function csvEscape(v) {
  const s = String(v === null || v === undefined ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(headers, rows) {
  return [headers.join(",")].concat(rows.map(function (r) {
    return headers.map(function (h) { return csvEscape(r[h]); }).join(",");
  })).join("\n");
}
function round2(n) { return Math.round(n * 100) / 100; }

var SCALES = {
  nps: { min: 0, max: 10, label: "NPS (0-10)" },
  csat: { min: 1, max: 5, label: "CSAT (1-5)" },
  ces: { min: 1, max: 7, label: "CES (1-7)" }
};

function numericValues(rows, column) {
  const out = [];
  rows.forEach(function (r) {
    const v = Number(r[column]);
    if (r[column] !== "" && r[column] !== undefined && !isNaN(v)) { out.push(v); }
  });
  return out;
}

// Decide the score type for a set of values (optionally guided by the header name).
function inferScoreType(values, headerName) {
  const h = String(headerName || "").toLowerCase();
  if (/nps|recommend/.test(h)) { return "nps"; }
  if (/ces|effort/.test(h)) { return "ces"; }
  if (/csat|satisf/.test(h)) { return "csat"; }
  if (!values.length) { return null; }
  const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  if (max <= 5 && min >= 1) { return "csat"; }
  if (max <= 7 && min >= 1) { return "ces"; }
  if (max <= 10 && min >= 0) { return "nps"; }
  return null;
}

function detectScoreColumn(headers, rows) {
  let best = null;
  headers.forEach(function (h) {
    const values = numericValues(rows, h);
    if (values.length < 1) { return; }
    const ratio = values.length / Math.max(1, rows.length);
    if (ratio < 0.5) { return; }
    const type = inferScoreType(values, h);
    if (!type) { return; }
    const named = /nps|csat|ces|score|rating|recommend|satisf|effort/.test(h.toLowerCase()) ? 1 : 0;
    const score = named * 100 + ratio;
    if (!best || score > best.score) { best = { column: h, type: type, score: score }; }
  });
  return best ? { column: best.column, type: best.type } : null;
}

function validScores(scores, type) {
  const scale = SCALES[type] || SCALES.nps;
  return scores.map(Number).filter(function (v) { return !isNaN(v) && v >= scale.min && v <= scale.max; });
}

function meanOf(values) {
  if (!values.length) { return 0; }
  return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
}

// 95% CI half width for a proportion in percent.
function proportionCI(pct, n) {
  if (!n) { return 0; }
  const p = pct / 100;
  return round2(1.96 * Math.sqrt((p * (1 - p)) / n) * 100);
}

function summarize(scores, type) {
  const valid = validScores(scores, type);
  const n = valid.length;
  const base = { type: type, n: n, mean: round2(meanOf(valid)), score: null, ciLow: null, ciHigh: null, ciHalfWidth: null, warning: n < 30 ? "Small sample: fewer than 30 responses, treat this score with caution." : null };
  if (!n) { base.warning = "No valid responses."; return base; }
  if (type === "nps") {
    const promoters = valid.filter(function (v) { return v >= 9; }).length;
    const passives = valid.filter(function (v) { return v >= 7 && v <= 8; }).length;
    const detractors = valid.filter(function (v) { return v <= 6; }).length;
    const pProm = promoters / n, pDetr = detractors / n;
    const score = round2((pProm - pDetr) * 100);
    // Standard error of NPS in points.
    const variance = (pProm + pDetr - Math.pow(pProm - pDetr, 2)) / n;
    const half = round2(1.96 * Math.sqrt(Math.max(0, variance)) * 100);
    return Object.assign(base, {
      score: score, promoters: promoters, passives: passives, detractors: detractors,
      promoterPct: round2(pProm * 100), passivePct: round2((passives / n) * 100), detractorPct: round2(pDetr * 100),
      ciHalfWidth: half, ciLow: round2(score - half), ciHigh: round2(score + half)
    });
  }
  if (type === "csat") {
    const satisfied = valid.filter(function (v) { return v >= 4; }).length;
    const pct = round2((satisfied / n) * 100);
    const half = proportionCI(pct, n);
    return Object.assign(base, { score: pct, satisfied: satisfied, satisfiedPct: pct, ciHalfWidth: half, ciLow: round2(pct - half), ciHigh: round2(Math.min(100, pct + half)) });
  }
  // CES: share rating the experience easy (5-7 on a 1-7 scale).
  const easy = valid.filter(function (v) { return v >= 5; }).length;
  const pct = round2((easy / n) * 100);
  const half = proportionCI(pct, n);
  return Object.assign(base, { score: pct, easy: easy, easyPct: pct, ciHalfWidth: half, ciLow: round2(pct - half), ciHigh: round2(Math.min(100, pct + half)) });
}

function monthBucket(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) { return m[1] + "-" + ("0" + m[2]).slice(-2); }
  const d = new Date(s);
  if (!isNaN(d.getTime())) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
  return s || "(blank)";
}

function groupSummaries(rows, scoreColumn, type, groupColumn, groupIsDate) {
  const groups = {};
  rows.forEach(function (r) {
    let key = groupColumn ? String(r[groupColumn] || "(blank)") : "All";
    if (groupIsDate) { key = monthBucket(key); }
    if (!groups[key]) { groups[key] = []; }
    const v = Number(r[scoreColumn]);
    if (!isNaN(v) && r[scoreColumn] !== "") { groups[key].push(v); }
  });
  return Object.keys(groups).sort().map(function (key) {
    const s = summarize(groups[key], type);
    s.segment = key;
    return s;
  });
}

function analyzeCSV(text, options) {
  const opts = options || {};
  const parsed = parseCSV(text);
  let detection = detectScoreColumn(parsed.headers, parsed.rows);
  const scoreColumn = opts.scoreColumn || (detection && detection.column);
  const type = opts.type || (detection && detection.type) || "nps";
  if (!scoreColumn) { return { error: "No numeric score column detected.", headers: parsed.headers }; }
  const scores = numericValues(parsed.rows, scoreColumn);
  const overall = summarize(scores, type);
  const segments = opts.groupColumn ? groupSummaries(parsed.rows, scoreColumn, type, opts.groupColumn, !!opts.groupIsDate) : [];
  return { headers: parsed.headers, scoreColumn: scoreColumn, type: type, overall: overall, segments: segments, rowCount: parsed.rows.length };
}

function buildSummaryCSV(analysis) {
  const headers = ["segment", "type", "n", "score", "mean", "ci_low", "ci_high", "promoters", "passives", "detractors", "warning"];
  const mk = function (s, segment) {
    return { segment: segment, type: s.type, n: s.n, score: s.score, mean: s.mean, ci_low: s.ciLow, ci_high: s.ciHigh, promoters: s.promoters !== undefined ? s.promoters : "", passives: s.passives !== undefined ? s.passives : "", detractors: s.detractors !== undefined ? s.detractors : "", warning: s.warning || "" };
  };
  const rows = [mk(analysis.overall, "OVERALL")].concat((analysis.segments || []).map(function (s) { return mk(s, s.segment); }));
  return toCSV(headers, rows);
}

const api = { parseCSV, toCSV, SCALES, numericValues, inferScoreType, detectScoreColumn, validScores, summarize, proportionCI, monthBucket, groupSummaries, analyzeCSV, buildSummaryCSV };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
if (typeof window !== "undefined") { window.SurveyScoreBatch = api; }
