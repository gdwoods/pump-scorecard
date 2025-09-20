# Pump Scorecard  

A Next.js web application for short-sellers to quickly assess risk signals on microcap tickers. The app aggregates fundamentals, SEC filings, insider/institutional ownership, fraud evidence, and historical price behavior into a **weighted risk score**.  

---

## 🚀 Usage  

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

2. **Fundamentals**  
   - Market cap, float, insider/institutional ownership, average volume.  
   - Missing values filled with `null` and labeled in UI.  

3. **Filings**  
   - Parsed for recent S-1/S-3 (dilution risk), going-concern warnings, and leadership changes.  

4. **Fraud Evidence**  
   - If ticker matches known fraud cases, thumbnails are shown.  
   - If no evidence → displays *“No fraud evidence found for this ticker. Please do a manual check here”* with a link to the fraud site.  

5. **Promotions**  
   - Stock promotion alerts shown by date/type.  
   - If no results → displays *“No promotions found for this ticker. Please do a manual check here”* with a link.  

---

## 📊 Droppiness Score  

The **Droppiness Score** measures how a ticker behaves after major spikes over the last 24 months.  

**How it works:**  
- A “spike” is identified when price jumps significantly on high volume.  
- We then measure whether the stock retraced (dropped back down) within a short window.  
- Each spike contributes to the overall score: many fades = higher droppiness.  

**Interpretation for short sellers:**  
- **Spikes fade quickly →** This is a hallmark of pump-and-dump activity. It is a **negative credibility signal** for the company, but a **positive setup for shorts**, since history shows spikes do not hold.  
- **Spikes hold →** Suggests stronger underlying support or genuine buying. It is **less favorable for shorts** and riskier to bet against.  
- **Mixed behavior →** A balanced profile; some spikes fade, others sustain.  

The score is converted into a **verdict** (e.g. *“Spikes usually fade quickly”* vs. *“Spikes often hold”*) and displayed in the Final Verdict card.  

---

## 📊 Risk Scoring  

Each module contributes to a weighted score:  

- **Fundamentals**: weak balance sheet, low cash, high burn → risk points.  
- **Filings**: dilution potential, going concern flagged → risk points.  
- **Promotions**: more promotions = higher score.  
- **Fraud**: confirmed fraud evidence = heavy penalty.  
- **Droppiness**: fades boost score (indicating historical pump-and-dump activity).  

Manual flags adjust the score in real time to reflect user judgment.  

---

## 📦 Deployment  

- Built on **Next.js 15** with Turbopack.  
- Hosted on Vercel.  
- Exports PDF reports using serverless API route.  

---

## 🔗 External Links  

- [Stop Nasdaq China Fraud](https://www.stopnasdaqchinafraud.com/)  
- [SEC EDGAR](https://www.sec.gov/edgar/searchedgar/companysearch.html)  
- [Yahoo Finance API](https://github.com/gadicc/node-yahoo-finance2)  
