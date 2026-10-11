# QuizMetric — AI Assessment Studio

*Create Smarter Questions. Assess Better.*

Teacher-first, free-tier-compatible MCQ app with AI generation, editable questions, exam/quiz mode, CSV + JSON download and Print / Save as PDF. English, Urdu and Sindhi. Grade 1–12. No paid npm dependencies, no account or database required.

## Live features
- Generate **5, 10, 15 or 20** multiple-choice questions for a topic and optional reference text.
- Choose **Grade 1–12**, **Easy/Medium/Hard**, **English/Urdu/Sindhi**.
- AI returns **four options, one answer, and an explanation** per question.
- **Edit** questions, all options, correct answers and explanations before printing.
- **Quiz mode**: click answers, check score and explanations, retry.
- **Print/Save as PDF**: print question paper with optional answer key.
- **Export CSV (Excel-compatible, Unicode BOM)** and JSON.
- Restore your previous set from **browser localStorage** (no cloud backup).
- **Try sample set** works without API key or internet (after page loads).

## What is required for REAL AI generation?
Use a free-tier Gemini API key from https://aistudio.google.com/apikey. **Do not put it in the HTML or GitHub.**

1. Deploy to Vercel (personal non-commercial use on Hobby), or run locally.
2. Vercel project → Settings → Environment Variables → add `GEMINI_API_KEY` (server-side, production / preview as appropriate).
3. Optional: `GEMINI_MODEL=gemini-3.5-flash-lite`. This model had a free tier as of October 2026; access and quotas can change. Set a model your key can actually access.
4. **Redeploy** after changing the environment. AI generation will now work while your provider key and quota work.

If the site says **AI not configured**, this is deliberate: it will not pass sample questions off as AI-generated questions.

## Run locally

```bash
cd ai-mcq-generator
# macOS/Linux: export GEMINI_API_KEY=...
# PowerShell: $env:GEMINI_API_KEY="..."
npm start
# open http://localhost:3000
```

No `npm install` needed. Uses Node.js >= 20 for native `fetch`. The local server doesn't auto-read `.env`; set the variable in the shell.

## Deploy using the Vercel website

1. Create a GitHub repository and upload these project files (keep `.env` out).
2. Vercel → Add New → Project → Import repository.
3. Framework preset: **Other** (static root `index.html` plus `api/generate.js`).
4. Deploy. Use **Settings → Environment Variables** to add `GEMINI_API_KEY`, then redeploy.

No database, login or cloud storage are used in this MVP. If releasing publicly to many users, add persistent per-user rate limiting, bot protection, accounts and abuse controls before enabling a shared API key; browser data can be lost if cache/storage is cleared.

## Notes about accuracy and privacy
AI answers can be wrong; a teacher should review each correct answer. Pasted lesson material is transmitted to Google's Gemini service for generation. Do not paste private student data. Free-tier requests may be subject to provider terms on how data is used. Google quotas vary; free tier is limited, not unlimited.

## Tests

`npm test` — validates the AI response schema without calling the provider.

## API
POST `/api/generate` JSON: `{topic,source,grade,count,difficulty,language}`

Response: `{questions:[{id,question,options:[A,B,C,D],answer:0..3,explanation}],meta}`.

Errors include 400 (invalid input), 429 (quota), 502 (upstream error), 503 (missing configuration), 504 (timeout).