# Short Check + Pump Scorecard

This monorepo-style Next.js app powers two related tools:

- Short Check: DT screenshot → deterministic short setup rating, alert labels, red‑flag tags, shareable link, PDF export.
- Pump Scorecard: original fundamentals/risk scorecard by ticker.

They share infrastructure but can be deployed as separate Vercel projects.

---

## 🚀 Usage  

Short Check

1. Visit `/short-check`.
2. Upload a DT screenshot (drag/drop, Select Image, or paste) or use Quick Ticker Analysis.
3. The app will OCR DT badges (High/Medium/Low and Red/Yellow/Green), fetch recent news from Yahoo/Finnhub, and compute the Short Check rating and breakdown.
4. Use the right‑aligned action buttons: Copy Summary, Export PDF, Share.

Pump Scorecard

1. Enter a ticker in the search box.  
2. The app scans:  
   - **SEC filings** (10-Q, 10-K, S-1, S-3, etc.)  
   - **Fundamentals** from Yahoo Finance  
   - **Promotions** (paid stock promo databases, email alerts)  
   - **Fraud evidence** (stopnasdaqchinafraud.com)  
   - **Historical charts** (droppiness / spike analysis)  
   - **Country of origin** and address parsing  
3. Results are displayed in cards with detailed sections:  
   - Final Verdict  
   - Fundamentals  
   - Country & Address  
   - Promotions  
   - Filings  
   - Fraud Evidence  
   - Droppiness (spike/fade behavior)  

4. Manual checkboxes can be toggled to adjust the score if the automated scan misses nuance.  
5. Export the full report as a PDF for record-keeping or sharing.  

---

## 🛠️ Technical Details  

### Data Sources  

- **Yahoo Finance**: fundamentals, key statistics, chart data.  
- **SEC EDGAR**: filings scraped via API, company addresses normalized with custom country parser.  
- **Fraud Evidence**: pulled from stopnasdaqchinafraud.com’s dataset, thumbnails/lightbox for images.  
- **Promotions**: external databases and trackers, linked if no entries found.  

### Processing Flow  

1. **Ticker Input → API Scan Route**  
   - `/api/scan/[ticker]/route.ts` orchestrates all lookups.  
   - Each module is wrapped in try/catch to fail gracefully.  

Short Check

- `/api/short-check` processes images and computes the Short Check score
- `/api/short-check/export-pdf` generates a PDF report (includes Pump Scorecard data if available)
- `/api/share/generate` + `/api/share/[id]` create and serve shareable links
- `/share/[id]` is the public read‑only view

2. **Fundamentals**  
   - Market cap, float, insider/institutional ownership, average volume.  
   - Missing values filled with `null` and labeled in UI.  

3. **Filings**  
   - Parsed for recent S-1/S-3 (dilution risk), going-concern warnings, and leadership changes.  

4. **Fraud Evidence**  
   - If ticker matches known fraud cases, thumbnails are shown with lightbox expansion.  
   - If no evidence → displays *“No fraud evidence found for this ticker. Please do a manual check here”* with a link to the fraud site.  

5. **Promotions**  
   - Stock promotion alerts shown by date/type.  
   - If no results → displays *“No promotions found for this ticker. Please do a manual check here”* with a link.  

---

## 📊 Droppiness Score  

The **Droppiness Score** measures how a ticker behaves after major spikes over the last 24 months.  

**How it works:**  
- A “spike” is identified when price jumps significantly on high volume.  
- The system measures whether the stock retraced (dropped back down) within a short window.  
- Each spike contributes to the overall score:  
  - **Retraced quickly → adds to droppiness** (hallmark of pump-and-dump).  
  - **Held levels → lowers droppiness** (suggests support or genuine demand).  

**Interpretation for short sellers:**  
- **Spikes fade quickly →** Negative credibility signal for the company, but a **positive short setup**, since history shows spikes don’t hold.  
- **Spikes hold →** Riskier for shorts, as the stock may have stronger underlying support.  
- **Mixed behavior →** Some spikes fade, others sustain → moderate risk profile.  

**Verdict Mapping:**  
- Droppiness Score ≥ 70 → “Spikes usually fade quickly”  
- Droppiness Score ≤ 40 → “Spikes often hold”  
- Between 40–70 → “Mixed behavior”  

The verdict is shown in both the Droppiness section and the Final Verdict card.  

---

## 📊 Risk Scoring  

Each module contributes to a weighted score:  

- **Fundamentals**: 20% (weak balance sheet, high burn, low cash = risk).  
- **Filings**: 25% (recent S-1/S-3, going concern = risk).  
- **Promotions**: 20% (multiple paid campaigns = risk).  
- **Fraud**: 25% (confirmed fraud evidence = major penalty).  
- **Droppiness**: 10% (fades add points = riskier credibility profile).  

Manual flags adjust the score in real time to reflect user judgment.  

### Short Check Scoring & UX
- 12 categories, including Droppiness; alert labels and walk‑away flags.
- DT tag mapping covers both color tags (Red/Yellow/Green) and text labels (High/Medium/Low).
- Overhead Supply OCR tightened to avoid stray “high” misclassifications.
- “Major Developments” from DT is ignored unless the first dated item is within 7 days (then used as the news headline with date).
- News Catalyst scored with deterministic keywords using Yahoo/Finnhub fetch.
- Score Breakdown is collapsible; includes red‑flag tags and “Why this matters” tooltips.
- Quick Actions: TradingView / Finviz / SEC EDGAR on the left; Copy / PDF / Share on the right.

---

## ⚠️ Limitations  

- **Coverage Gaps**:  
  - Fraud database only covers certain regions (primarily China).  
  - Promotions data may miss Telegram/WhatsApp campaigns.  
- **Interpretation**: Risk score is an **opinionated signal**, not investment advice.  
- **Manual Review**: Always verify with external links provided in Fraud and Promotions sections.  

---

## 📦 Deployment  

- Built on **Next.js 15** with Turbopack.  
- Hosted on Vercel.  
- Exports PDF reports using serverless API route.  

### Environment Variables
- `FINNHUB_API_KEY` (news)
- `GOOGLE_CLOUD_VISION_API_KEY` (OCR)
- `NEXT_PUBLIC_BASE_URL` (domain only; used for share links)
- Vercel KV (any supported naming): `KV_REST_API_REDIS_URL` + `KV_REST_API_REDIS_TOKEN` or `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Notes:
- Local dev stores shares in memory (not persistent across reloads).
- Preview URLs may require Vercel auth; prefer a production domain for sharing.

---

## 👨‍💻 Developer Notes  

- **Pump Scorecard Scan**: `/app/api/scan/[ticker]/route.ts`  
- **Short Check Scoring**: `/lib/shortCheckScoring.ts`  
- **Short Check Helpers**: `/lib/shortCheckHelpers.ts`  
- **OCR Parser**: `/lib/ocrParser.ts`  
- **Short Check UI**: `/components/short-check/*`  
- **Short Check PDF Export**: `/app/api/short-check/export-pdf/route.ts`  
- **Share Storage**: `/lib/shareStorage.ts` + `/app/api/share/*` + `/app/share/[id]/page.tsx`  

To extend:  
- Add new data sources by editing the scan route.  
- Adjust scoring weights in `/utils/scoring.ts`.  
- Add new report elements in `/components` and export handler.  

---

## 🔗 External Links  

- [Stop Nasdaq China Fraud](https://www.stopnasdaqchinafraud.com/)  
- [SEC EDGAR](https://www.sec.gov/edgar/searchedgar/companysearch.html)  
- [Yahoo Finance API](https://github.com/gadicc/node-yahoo-finance2)  

---

## 📊 Example Output  

**Ticker: QMMM**  
- Country: China  
- Filings: Recent S-3 shelf offering  
- Fraud Evidence: 3 confirmed images from stopnasdaqchinafraud.com  
- Promotions: 2 paid email campaigns in last 30 days  
- Droppiness: Score 82 → “Spikes usually fade quickly”  
- Weighted Risk Score: 87/100 → Very High Risk  
