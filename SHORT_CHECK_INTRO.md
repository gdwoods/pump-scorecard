# Short Check — Quick Introduction

## What is Short Check?

Short Check analyzes dilution tracker screenshots to quickly identify high-quality short trade opportunities. Upload a screenshot and get an instant risk assessment, then layer in live market data by ticker.

## How It Works

1. **Upload a Screenshot**: Drag, drop, paste, or select a screenshot from your dilution tracker (Dilution Tracker, FinTwit, etc.)
2. **OCR Processing**: The app extracts DT badges (High/Medium/Low and Red/Yellow/Green) and key metrics
3. **Instant Scoring**: Get a 0–100% Short Rating indicating trade quality
4. **Verdict stack**: Fast Verdict (Framework 3.0) + fundamental context + Short Check walk-aways — one card at the top when scan data is present

## Key Features

### 📊 **Smart Scoring System**
- **High-Priority Short Candidate** (>80%): Strong setup with multiple risk factors
- **Moderate Short Candidate** (70–80%): Solid setup with some risk factors
- **Speculative Short Candidate** (65–70%): Marginal setup; unverified droppiness also caps here
- **No-Trade** (<65% or any walk-away): Disqualified

### 🚨 **Alert Labels**
Visual chips highlight critical conditions:
- 🔴 **Cash Raise Likely**: Runway < 2 months AND burn > $1M
- ⚠️ **Low Float Risk**: Float < 3M shares
- 🟠 **Max Dilution Tools**: ATM + S-1 + Convertibles all present

### 🏷️ **Red Flag Tags**
Quick visual indicators on each score category:
- 🔴 **Urgent** (Cash Runway < 3 months)
- 🧨 **Active Shelf** (ATM/S-1 in place)
- ⚠️ **Weak Support** (Institutional ownership < 2%)
- 🎈 **Thin Float** (Float < 5M)
- 📈 **Elevated** (Short interest > 6%)

### 📈 **Integrated market analysis**
After uploading a screenshot, enter the ticker to get:
- **Verdict stack**: Fast Verdict + DT synopsis + SEC Capital Pressure note + walk-aways
- **Droppiness Analysis**: Historical spike behavior
- **Capital Pressure**: SEC evidence of capital need + issuance mechanisms (research signal; see [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md))
- **AI Thesis**: Groq-synthesized short thesis (cached 24h)
- **SEC Filings**: Recent filings and dilution events
- **Charts & Fundamentals**: Full market context
- **Promotions**: Stock promotion history
- **Social Sentiment**: StockTwits (below Capital Pressure)

**Quick Ticker** (no screenshot): Fast Verdict + scan cards only — no Short Rating % or fundamental context block.

### 🔗 **Actions & Sharing**
- **Copy Summary** (full formatted report)
- **Export PDF** (server-rendered, includes scan data when available)
- **Share Link** (KV-backed; public read-only)

### 📝 **Fundamental context**
When scan data is present, the verdict stack includes a plain-English synopsis from DT metrics plus an optional SEC Capital Pressure note — not a separate headline card.

## Why Use Short Check?

- **Speed**: Analyze a setup in seconds instead of minutes
- **Consistency**: Standardized scoring eliminates guesswork
- **Comprehensive**: Combines dilution data with Framework 3.0 fast screen and market analysis
- **Visual**: Alert labels and tags make risk factors immediately clear

## Getting Started

1. Visit: https://short-check.vercel.app
2. Upload a screenshot from your dilution tracker
3. Review the verdict stack, Short Rating %, and alerts (DT “Major Developments” is ignored unless ≤ 7 days old)
4. Enter the ticker for droppiness, Capital Pressure, filings, and charts

## Other surfaces

| Route | Use |
|-------|-----|
| `/fast-scan` | Ticker-only Fast Verdict + Droppiness + CP + AI thesis |
| `/watchlist` | Up to 20 tickers in parallel (Fast / Drop / CP columns) |
| `/pump-scorecard` | Full scan UI (Droppiness + CP lead; no legacy pump headline score) |

## Pro Tips

- **Manual Entry**: If OCR fails or misses data, click "Or enter data manually" to input values directly
- **Paste Images**: You can paste screenshots directly (Cmd+V / Ctrl+V) instead of saving files
- **Quick Ticker Analysis**: Use the ticker input box for Fast Verdict + scan data without a screenshot (no Short Rating %)

## Questions or Issues?

The app includes detailed explanations:
- Hover over the ℹ️ icons for "Why This Matters" tooltips
- Click on red flag tags to see what they mean
- All data sources and calculations are transparent in the score breakdown

---

**Built for traders who understand that timing and risk assessment are everything in short trading.**
