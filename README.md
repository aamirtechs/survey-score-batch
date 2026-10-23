# Survey Score Batch
Live page: https://aamirtechs.github.io/survey-score-batch/

Drop a raw survey export and get NPS, CSAT and CES, overall and broken down by agent, channel, month or plan. Sellers, operators and developers currently do this by hand, one row or one request at a time, in spreadsheets and paid suites. This tool does the whole batch in the browser for free.

## Features
- CSV upload with automatic score column detection for 0 to 10 NPS, 1 to 5 CSAT and 1 to 7 CES scales.
- Overall score with promoter, passive and detractor split for NPS and satisfied share for CSAT and CES.
- Group by any other column such as agent, channel, plan, or a date column bucketed by month.
- 95 percent confidence interval and a sample size warning on every segment, plus a summary CSV and chart PNG export.

## How it works
Paste or upload your input, set the options, and run the tool. All processing happens locally in your browser using the shared logic in `src/logic.js`, and you can download the results as files. It runs entirely in the browser.

## Privacy
Runs 100% in your browser. Your files never leave this device, nothing is uploaded,
and there is no tracking.

## Development
Core logic lives in `src/logic.js` and is shared by the page and the tests.
Run the tests with `npm test`.

## License
MIT, Copyright 2026 Amir Hussain.
