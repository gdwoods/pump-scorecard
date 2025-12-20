# Short Check — Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Scoring System](#scoring-system)
4. [Droppiness Calculation (Bayesian Approach)](#droppiness-calculation-bayesian-approach)
5. [Data Sources & APIs](#data-sources--apis)
6. [OCR Processing](#ocr-processing)
7. [Walk-Away Flags](#walk-away-flags)
8. [Alert Labels & Red Flags](#alert-labels--red-flags)
9. [Advanced Features](#advanced-features)
10. [Technical Architecture](#technical-architecture)

---

## Overview

**Short Check** is an automated analysis tool designed to identify high-quality short trade opportunities by analyzing dilution tracker screenshots and market data. The app combines:

- **OCR (Optical Character Recognition)** to extract data from dilution tracker screenshots
- **Quantitative scoring** based on 12 risk factors
- **Bayesian statistical analysis** for price behavior (droppiness)
- **Real-time market data** from multiple APIs
- **Comprehensive risk assessment** with visual alerts

The tool outputs a 0-100% rating that categorizes stocks into four risk tiers, helping traders quickly assess short trade viability.

---

## Core Features

### 1. **Screenshot Upload & OCR**
- Drag-and-drop, paste, or file selection
- Automatic extraction of dilution tracker badges (Red/Yellow/Green, High/Medium/Low)
- Manual entry fallback if OCR fails
- Supports PNG, JPG, JPEG, WebP formats (max 4MB)

### 2. **Instant Scoring (0-100%)**
- **High-Priority Short Candidate** (70-100%): Strong setup with multiple risk factors
- **Moderate Short Candidate** (40-70%): Decent setup, worth monitoring
- **Speculative Short Candidate** (20-40%): Weak setup, lower conviction
- **No-Trade** (<20%): Not a good short opportunity

### 3. **Integrated Pump Scorecard Analysis**
After uploading a screenshot, entering the ticker provides:
- Droppiness analysis (Bayesian-calculated price behavior)
- Pump risk scorecard
- SEC filings and insider transactions
- Promotions and fraud evidence
- Charts, fundamentals, and market data
- Social sentiment (StockTwits)
- Borrow desk data (short availability)

### 4. **Export & Sharing**
- **Copy Summary**: Full formatted text report
- **Export PDF**: Server-rendered PDF with all analysis
- **Share Link**: Public read-only links (7-day expiration, stored in Vercel KV)

---

## Scoring System

The Short Check rating is calculated from **12 scoring components**, each contributing points that are normalized to a 0-100% scale. The maximum possible score varies based on disqualifying factors (e.g., positive cash flow reduces max score).

### Scoring Components

#### 1. **Cash Need** (0-25 points)
**Purpose**: Assesses urgency of capital raising needs.

**Calculation**:
- **High (+25)**: Cash runway < 6 months
- **Moderate (+18)**: Cash runway 6-24 months
- **Low (+5)**: Cash runway > 24 months OR positive cash flow

**Data Sources**: OCR from dilution tracker, Yahoo Finance balance sheet

**Special Logic**: 
- Respects DT tags (DT:High/Medium/Low) when available
- Positive cash flow = low cash need (not a walk-away for this component)

---

#### 2. **Cash Runway** (0-15 points, can be negative)
**Purpose**: Measures time until cash depletion.

**Calculation**:
- **< 0 months (negative cash)**: +15 points
- **< 6 months**: +15 points
- **6-12 months**: +10 points
- **12-18 months**: +3 points
- **18-24 months**: +1 point
- **≥ 24 months**: -10 points (walk-away penalty)

**Special Logic**:
- If Cash Need is Green (Low), Cash Runway is scored as neutral-to-positive (10 points) to avoid double-counting
- Positive cash flow triggers -10 penalty (walk-away flag)

---

#### 3. **Offering Ability & Overhead Supply** (Matrix: -30 to +25 points)
**Purpose**: Evaluates dilution mechanisms and share supply pressure.

**Calculation**: Uses a **3x3 matrix** combining Offering Ability (rows) and Overhead Supply (columns):

| | Red Overhead | Yellow Overhead | Green Overhead |
|---|---|---|---|
| **Red Offering** | +25 | +22 | +18 |
| **Yellow Offering** | +21 | +15 | +10 |
| **Green Offering** | -5 | -20 | -30 (walk-away) |

**Offering Ability Determination**:
- **Red**: Active dilution (ATM Active, Equity Line, Share Purchase Agreement, warrants, convertibles, White Lion)
- **Yellow**: S-1/Shelf filed but not yet active
- **Green**: No active dilution mechanism

**Overhead Supply Determination**:
- **Red**: O/S ≥ 1.2x Float OR dilution ratio > 100%
- **Yellow**: O/S ≥ 1.1x Float OR dilution ratio > 30%
- **Green**: O/S < 1.1x Float AND dilution ratio < 30%

**Special Logic**:
- DT tags (DT:Red/Medium/Green) take absolute precedence
- Green Offering + Green Overhead = walk-away (-30 points)

---

#### 4. **Historical Dilution** (0-10 points)
**Purpose**: Assesses pattern of shareholder dilution over time.

**Calculation**:
- **High (+10)**: O/S increased >100% over 3 years
- **Moderate (+7)**: O/S increased 30-100% over 3 years
- **Low (+3)**: O/S increased <30% over 3 years OR no historical data

**Data Sources**: 
- Primary: Yahoo Finance balance sheet history
- Fallback: SEC EDGAR filings (for microcaps/OTC)

**Special Logic**: Respects DT tags when available

---

#### 5. **Institutional Ownership** (0-5 points, can be negative)
**Purpose**: Measures professional investor support.

**Calculation**:
- **< 10%**: +5 points (Red)
- **10-25%**: +4 points
- **25-50%**: 0 points (high ownership is bullish offset)
- **50-75%**: -5 points
- **≥ 75%**: Walk-away flag (not scored)

**Default**: For microcaps (<$100M), defaults to +5 if data unavailable

---

#### 6. **Short Interest** (0-15 points, can be negative)
**Purpose**: Evaluates existing bearish positioning.

**Calculation**:
- **< 3%**: +15 points
- **3-7%**: +12 points
- **7-10%**: +10 points
- **10-15%**: +8 points
- **15-20%**: +6 points
- **20-25%**: +3 points
- **25-30%**: 0 points
- **≥ 30%**: -5 points (warning, not disqualifier)

**Default**: +8 points if data unavailable

---

#### 7. **News Catalyst** (0-15 points)
**Purpose**: Assesses recent bullish news that could drive price appreciation.

**Calculation**:
- **+0 points**: Recent bullish terms (within 7 days): partnership, approval, FDA approval, contract, revenue growth, strategic, breakthrough, acquisition, merger, deal, profit, earnings beat, guidance raise, positive, expands
- **+5 points**: Neutral headlines: earnings, launch, Q1-Q4, financials, presentation, conference, webcast, announces
- **+10 points**: Dilution-linked filings: S-1, ATM, 424B, convertible, warrants, equity line, share purchase agreement, shelf offering, public offering, follow-on
- **+15 points**: No news found OR mechanical updates (holders, share count, filing, form, register, delisted, split, dividend)

**Data Sources**: Yahoo Finance RSS, Finnhub API (optional)

**Special Logic**: 
- Recent bullish news (within 7 days) = walk-away flag
- Mechanical/share administrative updates score as "no news"

---

#### 8. **Float** (0-10 points, adjusted for Green Offering)
**Purpose**: Evaluates share supply and volatility risk.

**Calculation** (base scores):
- **< 500K**: +10 points (or -10 if Green Offering)
- **500K-1M**: +9 points (or -5 if Green Offering)
- **1M-2M**: +8 points
- **2M-5M**: +6 points
- **5M-10M**: +4 points
- **10M-20M**: +2 points
- **> 20M**: 0 points

**Special Logic**: Green Offering reduces float score (negative points for very low float)

---

#### 9. **Overall Risk** (0-10 points)
**Purpose**: Composite risk assessment combining multiple factors.

**Calculation**: Counts risk indicators:
- Cash runway < 6 months: +2
- Active dilution: +2
- Significant dilution (O/S ≥ 2x Float): +2
- Ultra-low institutional ownership (<1%): +2
- Low institutional ownership (<5%): +1
- High debt relative to cash: +1
- Microcap (<$50M): +1

**Scoring**:
- **≥ 5 indicators**: +10 points (High risk)
- **3-4 indicators**: +7 points (Moderate-high risk)
- **2 indicators**: +5 points (Moderate risk)
- **< 2 indicators**: +3 points (Low risk)

**Special Logic**: Respects DT Overall Risk tags when available

---

#### 10. **Price Spike** (0-10 points)
**Purpose**: Identifies recent speculative price moves.

**Calculation**:
- **≥ 20% spike**: +10 points
- **< 20%**: 0 points

**Data Sources**: OCR from DT screenshot (green price cards), or boolean indicator from chart context

---

#### 11. **Debt/Cash Ratio** (0-10 points)
**Purpose**: Assesses financial stress and capital raising likelihood.

**Calculation**:
- **Debt > 2x Cash**: +10 points
- **Debt 1-2x Cash**: +7 points
- **Debt < Cash**: +4 points
- **No debt data**: 0 points (default)

**Data Sources**: 
- Primary: OCR from DT screenshot
- Fallback: Yahoo Finance balance sheet

**Special Logic**: If only Net Cash available (not separate debt/cash), defaults to 0 points

---

#### 12. **Droppiness** (-8 to +12 points)
**Purpose**: Measures how quickly price spikes fade (favorable for shorting).

**Calculation**:
- **70-100 (High)**: +12 points (spikes fade quickly)
- **50-69 (Moderate-high)**: +5 points (spikes usually fade)
- **40-49 (Neutral)**: 0 points (mixed behavior)
- **< 40 (Low)**: -8 points (spikes hold, risky for shorting)

**See [Droppiness Calculation](#droppiness-calculation-bayesian-approach) section for detailed explanation.**

---

### Score Normalization

The total score is normalized to a 0-100% rating:

```
Rating = (Total Score / Max Possible Score) × 100
```

**Max Possible Score**:
- **Standard**: 162 points (includes Droppiness max of 12)
- **With positive cash flow**: 125 points (excludes Cash Runway component)
- **Without Droppiness data**: 150 points

**Note**: Total score can be negative due to walk-away penalties (e.g., Green Offering + Green Overhead = -30), which reduces the rating proportionally.

---

## Droppiness Calculation (Bayesian Approach)

**Droppiness** is a proprietary metric that measures how quickly price spikes fade after major moves. This is critical for short sellers: stocks with high droppiness (spikes fade quickly) indicate weak support and are more favorable for shorting.

### Algorithm Overview

The droppiness calculation uses **Bayesian shrinkage** with recency weighting to produce a robust score from historical price data.

### Step-by-Step Process

#### 1. **Data Collection**
- Fetches 1-minute intraday bars from Polygon.io API for the past **18 months**
- Aggregates into **8-hour buckets** (reduces noise while preserving spike patterns)
- Each bucket contains: open, high, low, close, volume

#### 2. **Spike Detection**
For each 8-hour bucket, detects spikes using two methods:
- **Between buckets**: `(current.high - previous.close) / previous.close`
- **Within bucket**: `(current.high - current.open) / current.open`

Uses the **maximum** of these two percentages.

**Spike Threshold**: > 20% increase qualifies as a spike.

#### 3. **Retracement Detection**
For each detected spike, checks if it retraced:
- **Within same bucket**: `(high - close) / high > 0.1` (10% retracement)
- **Next bucket**: `next.close < current.close × 0.9` (10% drop in next period)

If either condition is true, the spike is marked as "retraced."

#### 4. **Recency Weighting**
Each spike is weighted by age using exponential decay:

```
weight = exp(-ageDays / tauDays)
```

Where:
- `ageDays` = days since spike occurred
- `tauDays` = 365 (recency horizon - spikes older than 1 year have minimal weight)

**Example**: A spike from 30 days ago has weight `exp(-30/365) ≈ 0.92`, while a spike from 365 days ago has weight `exp(-365/365) ≈ 0.37`.

#### 5. **Weighted Average Calculation**
Calculates the weighted proportion of retraced spikes:

```
weightedSum = Σ(weight × (retraced ? 1 : 0))
weightTotal = Σ(weight)
pHat = weightedSum / weightTotal
```

Where `pHat` is the observed retracement rate (0-1).

#### 6. **Bayesian Shrinkage**
Applies Bayesian shrinkage toward a neutral prior to handle small sample sizes:

```
nEff = weightTotal  (effective sample size)
priorStrength = 3  (k - strength of prior belief)
priorMean = 0.5  (p₀ - neutral prior: 50% retracement rate)

pAdj = (nEff × pHat + priorStrength × priorMean) / (nEff + priorStrength)
```

**Interpretation**:
- With few spikes, the score shrinks toward 50 (neutral)
- With many spikes, the observed retracement rate dominates
- The prior strength of 3 means we need at least 3 effective spikes to overcome the prior

#### 7. **Final Score**
```
scoreV2 = round(clamp(pAdj, 0, 1) × 100)
```

**Special Cap**: If fewer than 2 spikes detected, score is capped at 85 (prevents 100% from a single spike).

### Mathematical Example

**Scenario**: Stock has 5 spikes over 18 months:
- Spike 1: 180 days ago, retraced (weight = 0.61)
- Spike 2: 90 days ago, retraced (weight = 0.78)
- Spike 3: 60 days ago, NOT retraced (weight = 0.85)
- Spike 4: 30 days ago, retraced (weight = 0.92)
- Spike 5: 10 days ago, retraced (weight = 0.97)

**Calculation**:
```
weightedSum = (0.61×1) + (0.78×1) + (0.85×0) + (0.92×1) + (0.97×1) = 3.28
weightTotal = 0.61 + 0.78 + 0.85 + 0.92 + 0.97 = 4.13
pHat = 3.28 / 4.13 = 0.794 (79.4% retracement rate)

nEff = 4.13
pAdj = (4.13 × 0.794 + 3 × 0.5) / (4.13 + 3) = (3.28 + 1.5) / 7.13 = 0.670

scoreV2 = round(0.670 × 100) = 67
```

**Result**: Droppiness score of 67 (moderate-high), indicating spikes usually fade.

### Why Bayesian?

1. **Handles Small Samples**: Stocks with few spikes get a conservative estimate (near 50) rather than extreme values
2. **Recency Weighting**: Recent spikes matter more than old ones, reflecting current market behavior
3. **Robust to Outliers**: A single anomalous spike won't dominate the score
4. **Theoretical Foundation**: Bayesian inference provides principled uncertainty handling

---

## Data Sources & APIs

### Primary APIs

#### 1. **Yahoo Finance** (Free, No API Key)
**Used For**:
- Stock quotes (price, volume, market cap)
- Company profile (sector, industry, employees, summary)
- Historical price data (6 months, 2 years for 52-week high/low)
- Balance sheet data (debt, cash, outstanding shares)
- Ownership data (institutional, insider percentages)
- Short interest
- News headlines (RSS feed)

**Modules Used**:
- `quote()` - Real-time quote data
- `quoteSummary()` - Detailed financials with modules:
  - `defaultKeyStatistics` - P/E, ratios, ownership
  - `summaryProfile` - Company info
  - `balanceSheetHistory` / `balanceSheetHistoryQuarterly` - Financials
  - `insiderHolders` / `institutionOwnership` - Ownership
  - `majorHoldersBreakdown` - Ownership breakdown
- `chart()` - Historical price data

**Rate Limits**: None (but be respectful)

---

#### 2. **Polygon.io** (Requires API Key: `POLYGON_API_KEY`)
**Used For**:
- Stock splits (last 2 years)
- Company metadata (country, exchange, options availability)
- Intraday price data (1-minute bars for droppiness calculation)

**Endpoints**:
- `/v3/reference/splits` - Stock split history
- `/v3/reference/tickers/{ticker}` - Company metadata
- `/v2/aggs/ticker/{ticker}/range/1/minute/{start}/{end}` - Intraday bars

**Rate Limits**: Varies by plan (free tier: 5 calls/minute)

---

#### 3. **Google Cloud Vision API** (Requires API Key: `GOOGLE_CLOUD_VISION_API_KEY`)
**Used For**:
- OCR text extraction from dilution tracker screenshots

**Endpoint**:
- `POST https://vision.googleapis.com/v1/images:annotate`

**Features**:
- `TEXT_DETECTION` - Extracts all text from image

**Pricing**: First 1,000 requests/month free, then ~$1.50 per 1,000 requests

---

#### 4. **SEC EDGAR** (Free, No API Key)
**Used For**:
- Company filings (S-1, 424B, 10-K, 10-Q, etc.)
- Company CIK lookup
- Historical outstanding shares (fallback for microcaps)
- Insider transactions (Form 4 filings)

**Endpoints**:
- `https://www.sec.gov/cgi-bin/browse-edgar` - Filing search
- `https://www.sec.gov/files/company_tickers.json` - Ticker to CIK mapping
- `https://data.sec.gov/submissions/CIK{number}.json` - Company filings
- `https://data.sec.gov/xbrl/companyconcept/` - XBRL data (for historical O/S)

**Rate Limits**: 
- 10 requests per second
- Must include User-Agent header

---

#### 5. **Stock Promotion Tracker** (Free, No API Key)
**Used For**:
- Stock promotion history

**Endpoint**:
- `https://www.stockpromotiontracker.com/api/stock-promotions?ticker={ticker}&dateRange=all&limit=10`

**Rate Limits**: Unknown (be respectful)

---

#### 6. **Stop Nasdaq China Fraud** (Free, No API Key)
**Used For**:
- Fraud evidence images and data

**Endpoint**:
- `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText={ticker}`

**Rate Limits**: Unknown (be respectful)

---

#### 7. **iBorrowDesk** (Free, No API Key)
**Used For**:
- Short borrow availability and fees

**Endpoint**:
- `https://www.iborrowdesk.com/api/ticker/{ticker}`

**Rate Limits**: Unknown (be respectful)

---

#### 8. **StockTwits API** (Free, No API Key)
**Used For**:
- Social sentiment (bullish/bearish message counts)

**Endpoint**:
- `https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json`

**Features**:
- Returns recent messages with sentiment labels (Bullish/Bearish)
- Calculates sentiment score: `(bullishCount / totalWithSentiment) × 100`

**Rate Limits**: Unknown (2-second timeout implemented)

---

#### 9. **Finnhub** (Optional, Requires API Key: `FINNHUB_API_KEY`)
**Used For**:
- News headlines (fallback if Yahoo Finance fails)

**Endpoint**:
- `https://finnhub.io/api/v1/company-news?symbol={ticker}&from={date}&to={date}&token={key}`

**Rate Limits**: Free tier: 60 calls/minute

---

### Data Source Priority & Fallbacks

#### Historical Outstanding Shares
1. **Primary**: Yahoo Finance balance sheet history
2. **Fallback**: SEC EDGAR XBRL data (for microcaps/OTC)

#### Debt/Cash Data
1. **Primary**: OCR from dilution tracker screenshot
2. **Fallback**: Yahoo Finance balance sheet

#### News Headlines
1. **Primary**: Yahoo Finance RSS feed
2. **Fallback**: Finnhub API (if API key available)

#### Ownership Data
1. **Primary**: Yahoo Finance `quote()` (shortPercentFloat, heldPercentInsiders, heldPercentInstitutions)
2. **Fallback**: Yahoo Finance `quoteSummary()` modules (insiderHolders, institutionOwnership, majorHoldersBreakdown)

---

## OCR Processing

### Image Preprocessing

Before OCR, images are preprocessed using Sharp library:
1. **Grayscale conversion** - Reduces color noise
2. **Normalization** - Enhances contrast
3. **Sharpening** - Improves text edge detection

### Text Extraction

Uses Google Cloud Vision API `TEXT_DETECTION` feature:
- Extracts all text from image
- Returns full text block + individual word annotations with bounding boxes
- Confidence scores for each annotation

### Data Parsing

The OCR text is parsed using regex patterns to extract:

#### Dilution Tracker Badges
- **Overall Risk**: "DT:Red", "DT:Yellow", "DT:Green", "DT:High", "DT:Medium", "DT:Low"
- **Offering Ability**: Same tags
- **Overhead Supply**: Same tags
- **Cash Need**: Same tags
- **Historical Dilution**: Same tags

#### Financial Metrics
- **Ticker**: 2-5 uppercase letters followed by price
- **Cash on Hand**: Dollar amounts ($X.XM, $X.XXM)
- **Quarterly Burn Rate**: Negative dollar amounts or "burn" keywords
- **Cash Runway**: "X.X months" or "X.X mo"
- **Float**: Share counts (X.XM, X.XXM)
- **Outstanding Shares**: Share counts
- **Market Cap**: Dollar amounts
- **Short Interest**: Percentages (X.X%)
- **Institutional Ownership**: Percentages
- **Price Spike**: Percentages from green price cards (e.g., "18.18%", "20.51%")

#### Status Indicators
- **ATM/Shelf Status**: "ATM Active", "S-1 Filed", "Equity Line", "Share Purchase Agreement", etc.
- **Recent News**: Headlines from "Major Developments" section (only if ≤ 7 days old)

### Confidence Scoring

OCR confidence is calculated from annotation confidence scores:
```
confidence = min(avg(annotation.confidences) / 100, 1.0)
```

Default confidence: 0.8 if only full text block available (no individual annotations).

### Error Handling

- If OCR fails: Returns error with `extractedData.confidence = 0`, user can use manual entry
- If partial data extracted: Still attempts scoring with available data
- Missing fields: Scoring framework handles gracefully (defaults to moderate scores)

---

## Walk-Away Flags

Walk-away flags are **disqualifying conditions** that indicate a stock is NOT a good short candidate, regardless of other factors. When walk-away flags are present, the category is set to "No-Trade" even if the calculated rating is high.

### Walk-Away Conditions

1. **Cash Runway ≥ 24 months**
   - Company has sufficient cash for extended operations
   - Low urgency for capital raising

2. **Positive Cash Flow**
   - Company is generating cash, not burning it
   - Indicates operational viability

3. **Institutional Ownership ≥ 75%**
   - High professional investor support
   - Strong fundamental backing

4. **Strong Positive News Catalyst (Recent)**
   - Recent bullish news (within 7 days) with keywords: partnership, approval, FDA approval, contract, revenue growth, strategic, breakthrough, acquisition, merger, deal, profit, earnings beat, guidance raise, positive, expands
   - Could drive price appreciation

5. **Market Cap Exclusions**
   - **> $100M**: Walk-away unless cash runway < 4 months
   - **$70-100M**: Walk-away unless cash runway ≤ 4 months
   - Larger companies have more resources and stability

6. **Green Offering + Green Overhead**
   - No active dilution mechanisms AND low overhead supply
   - Indicates healthy capital structure

### Walk-Away Flag Handling

- Flags are displayed prominently in the results
- Category is forced to "No-Trade" when flags exist
- Rating is still calculated and displayed (for transparency)
- Cash Runway walk-away is also penalized in scoring (-10 points)

---

## Alert Labels & Red Flags

### Alert Labels (Visual Chips)

Alert labels appear next to the rating percentage to highlight critical conditions:

#### 🔴 **Cash Raise Likely**
- **Condition**: Cash runway < 2 months AND quarterly burn > $1M
- **Color**: Red
- **Meaning**: Company likely needs to raise capital imminently

#### ⚠️ **Low Float Risk**
- **Condition**: Float < 3M shares
- **Color**: Orange
- **Meaning**: Higher volatility and manipulation risk

#### 🟠 **Max Dilution Tools**
- **Condition**: ATM + S-1 + Convertibles all present (3+ mechanisms)
- **Color**: Orange
- **Meaning**: Maximum dilution capability, high supply risk

### Red Flag Tags (Category Indicators)

Red flag tags appear on individual score categories:

#### 🔴 **Urgent** (Cash Runway)
- **Condition**: Cash runway < 3 months
- **Tooltip**: "Company may need to raise capital imminently"

#### 🧨 **Active Shelf** (Offering Ability)
- **Condition**: ATM Active, Active ATM, Active Dilution, Equity Line, Share Purchase Agreement
- **Tooltip**: "ATM/S-1 in place; capable of issuing shares"

#### ⚠️ **Shelf Filed** (Offering Ability)
- **Condition**: S-1 or Shelf filed (but not active)
- **Tooltip**: "S-1/Shelf filed but not yet active"

#### ⚠️ **Weak Support** (Institutional Ownership)
- **Condition**: Institutional ownership < 2%
- **Tooltip**: "Minimal institutional confidence"

#### 🎈 **Thin Float** (Float)
- **Condition**: Float < 5M shares
- **Tooltip**: "Higher volatility risk"

#### 📈 **Elevated** (Short Interest)
- **Condition**: Short interest > 6%
- **Tooltip**: "Bearish positioning is already underway"

---

## Advanced Features

### 1. **Manual Data Entry**
If OCR fails or misses data, users can manually enter:
- Ticker
- Cash on hand
- Quarterly burn rate
- Cash runway
- Float
- Outstanding shares
- Market cap
- ATM/Shelf status
- Short interest
- Institutional ownership
- Debt and cash (separate or net cash)

### 2. **Ticker Override**
- Single-letter tickers trigger a warning (likely OCR error)
- Users can override the detected ticker
- Override triggers re-fetch of Pump Scorecard data

### 3. **Quick Ticker Analysis**
- Enter ticker directly (without screenshot) for:
  - Droppiness analysis
  - Pump risk scorecard
  - Market data and charts
- Does NOT include Short Check scoring (requires dilution tracker data)

### 4. **History Tracking**
- Saves Short Check results to local history
- Includes: ticker, score, verdict, summary, factors, market data
- Accessible via History Card component

### 5. **Risk Synopsis Generation**
Automatically generates plain-English risk summaries:
> "XYZ has only 1.2 months of runway and multiple active dilution tools. With a float of 2.4M shares and institutional ownership of just 0.8%, it may face selling pressure."

### 6. **Alert Card**
Generates a formatted text summary suitable for sharing:
- Ticker and rating
- Key metrics (cash runway, burn rate, dilution tools, short interest, float, ownership, market cap)
- Walk-away flags
- Top 5 scoring factors

### 7. **PDF Export**
Server-rendered PDF includes:
- Short Check rating and breakdown
- Pump Scorecard data (when available)
- Charts and visualizations
- All risk factors and flags

### 8. **Share Links**
- Generates public share links (7-day expiration)
- Stored in Vercel KV (key-value database)
- Read-only view of results
- No authentication required

### 9. **Dark Mode**
- Toggle between light and dark themes
- Persists via localStorage
- Applies to all components

### 10. **Performance Monitoring**
- Tracks API call performance
- Logs slow requests
- Helps identify bottlenecks

---

## Technical Architecture

### Frontend
- **Framework**: Next.js 16.1.0 (React 19.1.0)
- **Styling**: Tailwind CSS 4.1.14
- **Charts**: Recharts 3.2.0
- **UI Components**: Radix UI, custom components
- **State Management**: React hooks (useState, useEffect)

### Backend
- **Runtime**: Node.js (Vercel serverless functions)
- **API Routes**: Next.js API routes
- **Image Processing**: Sharp 0.33.5
- **OCR**: Google Cloud Vision API (REST)
- **PDF Generation**: pdfkit, pdf-lib
- **Storage**: Vercel KV (for share links)

### Data Flow

1. **User uploads screenshot** → `/api/short-check` (POST)
2. **OCR extraction** → Google Cloud Vision API
3. **Data enrichment**:
   - Historical O/S → Yahoo Finance / SEC EDGAR
   - Debt/Cash → Yahoo Finance (if missing)
   - News → Yahoo Finance RSS / Finnhub
4. **Scoring calculation** → `calculateShortRating()`
5. **Results returned** → Frontend displays
6. **Optional**: User enters ticker → `/api/scan/[ticker]` fetches Pump Scorecard data
7. **Droppiness recalculation** → If droppiness data available, score is recalculated

### API Route Structure

- `/api/short-check` (POST) - OCR and scoring
- `/api/short-check` (PUT) - Manual data submission
- `/api/short-check/export-pdf` (POST) - PDF generation
- `/api/scan/[ticker]` (GET) - Pump Scorecard data
- `/api/share/generate` (POST) - Share link creation
- `/api/share/[id]` (GET) - Share link retrieval
- `/api/export-pdf` (GET) - Legacy PDF export

### Environment Variables

**Required**:
- `GOOGLE_CLOUD_VISION_API_KEY` - OCR processing

**Optional**:
- `POLYGON_API_KEY` - Droppiness calculation, splits, metadata
- `FINNHUB_API_KEY` - News headlines (fallback)
- `NEXT_PUBLIC_BASE_URL` - Share link generation
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - Share link storage (Vercel KV)

### Error Handling

- **OCR failures**: Graceful fallback to manual entry
- **API timeouts**: 2-5 second timeouts with fallbacks
- **Missing data**: Scoring uses defaults (moderate scores)
- **Network errors**: Retries and error messages displayed to user

### Performance Optimizations

- **Parallel API calls**: All data sources fetched concurrently using `Promise.allSettled()`
- **Image preprocessing**: Sharp optimizes images before OCR
- **Caching**: News and static data cached (5-minute revalidation)
- **Lazy loading**: Components load on demand
- **Code splitting**: Next.js automatic code splitting

---

## Conclusion

Short Check combines quantitative analysis, Bayesian statistics, and real-time market data to provide traders with a comprehensive short trade assessment tool. The scoring system is transparent, the data sources are documented, and the calculations are reproducible.

For questions or issues, refer to the inline tooltips (ℹ️ icons) and category explanations throughout the app.

---

**Version**: 1.0  
**Last Updated**: 2025  
**Built with**: Next.js, React, TypeScript, Tailwind CSS

