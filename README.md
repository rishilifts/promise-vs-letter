# Promise vs Letter

The recruiter promised one thing in chat. The offer letter says another.
Paste both and the app shows the detected differences with the lines the model
extracted from each side.

Built for the Clocked Build Challenge on the Clocked API
(injection check, extract, compare, rerank, grounding, pii).

## Run

```bash
npm install
echo 'CLOCKED_API_KEY=your_key' > .env.local
npm run build && npx next start --port 3810
```

Open http://localhost:3810. `http://localhost:3810/?sample=1` shows a recorded
run on the synthetic example documents (labeled as a sample in the UI).

## What it checks

Only these seven terms: salary/stipend, fees/deposit, role/title, joining date,
work location, training/probation, notice period. Any other term in the
documents is not compared.

## Limits

- Detections are model findings, not proof. A "not detected" result does not
  prove a term is fair, present or absent.
- Scores are uncalibrated model outputs.
- Conditional or weakening clauses are compared, but some phrasings may still
  be missed.
- Verbatim string-match checks apply only to pasted text, not to screenshot or
  PDF uploads.
- Everything pasted or uploaded is sent to the Clocked API (Rezolve AI) for
  processing; their data retention is unknown. The app itself does not
  intentionally save uploads to any disk or database.
- The report's personal-detail masking is a model pass, not a guarantee;
  check the text before sharing.

## Privacy

The API key lives only in `.env.local` (gitignored). Demo fixtures are
synthetic; no real job documents are included.
