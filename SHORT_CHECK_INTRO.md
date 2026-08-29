# Short Check — Quick Introduction

## What is Short Check?

Short Check is a tool that analyzes dilution tracker screenshots to quickly identify high-quality short trade opportunities. Instead of manually reviewing dilution data, upload a screenshot and get an instant risk assessment.

## How It Works

1. **Upload a Screenshot**: Drag, drop, paste, or select a screenshot from your dilution tracker (Dilution Tracker, FinTwit, etc.)
2. **OCR Processing**: The app extracts DT badges (High/Medium/Low and Red/Yellow/Green) and key metrics
3. **Instant Scoring**: Get a 0-100% rating indicating short trade quality
4. **Risk Analysis**: See alert labels, red flags, and a plain-English risk synopsis

## Key Features

### 📊 **Smart Scoring System**
- **High-Priority Short Candidate** (70-100%): Strong setup with multiple risk factors
- **Moderate Short Candidate** (40-70%): Decent setup, worth monitoring
- **Speculative Short Candidate** (20-40%): Weak setup, lower conviction
- **No-Trade** (<20%): Not a good short opportunity

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

### 📈 **Integrated Pump Scorecard Analysis**
After uploading a screenshot, enter the ticker to get:
- **Droppiness Analysis**: Historical spike behavior
- **Pump Risk Scorecard**: Comprehensive risk breakdown
- **SEC Filings**: Recent filings and dilution events
- **Capital Pressure**: SEC evidence of capital need + issuance mechanisms (research signal; see [`docs/CAPITAL_PRESSURE.md`](docs/CAPITAL_PRESSURE.md))
- **Promotions & Fraud Evidence**: Red flag detection
- **Charts & Fundamentals**: Full market context
- **Social Sentiment**: StockTwits (shown below Capital Pressure)

### 🔗 **Actions & Sharing**
- **Copy Summary** (full formatted report)
- **Export PDF** (server-rendered, includes Pump Scorecard data when available)
- **Share Link** (KV-backed; public read-only)

### 📝 **Plain-English Risk Synopsis**
Get a concise summary like:
> "XYZ has only 1.2 months of runway and multiple active dilution tools. With a float of 2.4M shares and institutional ownership of just 0.8%, it may face selling pressure."

## Why Use Short Check?

- **Speed**: Analyze a setup in seconds instead of minutes
- **Consistency**: Standardized scoring eliminates guesswork
- **Comprehensive**: Combines dilution data with market analysis
- **Visual**: Alert labels and tags make risk factors immediately clear

## Getting Started

1. Visit: https://short-check.vercel.app
2. Upload a screenshot from your dilution tracker
3. Review the score, alerts, and risk synopsis (DT “Major Developments” is ignored unless ≤ 7 days old)
4. Enter the ticker for full Pump Scorecard analysis

## Pro Tips

- **Manual Entry**: If OCR fails or misses data, click "Or enter data manually" to input values directly
- **Paste Images**: You can paste screenshots directly (Cmd+V / Ctrl+V) instead of saving files
- **Quick Ticker Analysis**: Use the ticker input box to quickly analyze any stock without uploading a screenshot

## Questions or Issues?

The app includes detailed explanations:
- Hover over the ℹ️ icons for "Why This Matters" tooltips
- Click on red flag tags to see what they mean
- All data sources and calculations are transparent in the score breakdown

---

**Built for traders who understand that timing and risk assessment are everything in short trading.**

