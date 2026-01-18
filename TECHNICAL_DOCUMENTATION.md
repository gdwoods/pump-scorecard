# SEC Dilution Alerts - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Sources](#data-sources)
4. [Technology Stack](#technology-stack)
5. [System Components](#system-components)
6. [Database Schema](#database-schema)
7. [API & Data Flow](#api--data-flow)
8. [Risk Scoring Algorithm](#risk-scoring-algorithm)
9. [Signal Detection](#signal-detection)
10. [Deployment & Infrastructure](#deployment--infrastructure)
11. [Development Setup](#development-setup)
12. [Configuration](#configuration)
13. [File Structure](#file-structure)
14. [Performance Considerations](#performance-considerations)
15. [Security & Compliance](#security--compliance)

---

## Overview

### Purpose

SEC Dilution Alerts is an automated monitoring system designed for short sellers and traders to track potential dilution events in publicly traded companies. The system:

- **Continuously monitors** SEC EDGAR filings in real-time
- **Identifies** dilution-related filings (S-1, S-3, 424B4, 424B5, 8-K, EFFECT)
- **Extracts** key offering details (amount, shares, pricing, warrants)
- **Detects** short-seller red flags (toxic debt, management turnover, toxic underwriters)
- **Calculates** risk scores based on multiple signals
- **Provides** a web interface for viewing, filtering, and monitoring alerts
- **Supports** ticker watchlists for personalized monitoring
- **Includes** configurable sound alerts for real-time notifications

### Target Audience

- Short sellers looking for dilution candidates
- Traders monitoring capital raising activities
- Financial analysts tracking corporate actions
- Researchers studying dilution patterns

---

## Architecture

### High-Level Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  SEC EDGAR API  │────▶│  Python Scraper  │────▶│   Supabase   │
│                 │     │   (Automated)    │     │  PostgreSQL  │
└─────────────────┘     └──────────────────┘     └──────┬───────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │   Next.js    │
                                                 │  Web App     │
                                                 │  (Vercel)    │
                                                 └──────────────┘
```

### Component Overview

1. **Python Scraper** (Backend)
   - Fetches company universe from SEC
   - Polls latest SEC filings feed
   - Parses filing documents (HTML/text extraction)
   - Extracts offering details and signals
   - Calculates risk scores
   - Stores results in Supabase

2. **Next.js Web Application** (Frontend)
   - React-based dashboard
   - Real-time data fetching from Supabase
   - Client-side filtering and sorting
   - Watchlist management
   - Auto-refresh polling (15-second intervals)

3. **Supabase PostgreSQL** (Database)
   - Stores company universe (CIK → Ticker mappings)
   - Stores filing alerts with parsed data
   - Stores user watchlists (anonymous UUID-based)

---

## Data Sources

### SEC EDGAR API

#### Company Tickers Endpoint
- **URL**: `https://www.sec.gov/files/company_tickers.json`
- **Format**: JSON
- **Content**: Complete mapping of CIK (Central Index Key) to ticker symbols
- **Update Frequency**: Updated periodically by SEC
- **Usage**: Initial universe building, CIK lookup for filings

#### Latest Filings Feed
- **Endpoint**: `https://www.sec.gov/cgi-bin/browse-edgar`
- **Parameters**:
  - `action=getcurrent` - Get current filings
  - `output=atom` - ATOM XML feed format (more reliable than JSON)
  - `count=100` - Number of filings per request
  - `type=<FORM_TYPE>` - Filter by form type (e.g., `type=S-1`)
- **Update Frequency**: Real-time (filings appear immediately after submission)
- **Historical Window**: ~1-2 days (feed only contains recent filings)
- **Rate Limits**: SEC requires User-Agent header; no official rate limit, but be respectful

#### Individual Filing Documents
- **URL Pattern**: `https://www.sec.gov/cgi-bin/viewer?action=view&cik={CIK}&accession_number={ACC_NO}&xbrl_type=v`
- **Format**: HTML with embedded text (sometimes multi-megabyte documents)
- **Parsing**: BeautifulSoup4 for HTML extraction, regex for pattern matching

#### Registration Statement Lookup
- **Method**: Search SEC filings by CIK and form type
- **Purpose**: Find original S-1 when amendments (S-1/A) lack details
- **Implementation**: Queries filing history API, matches by registration number

### Rate Limiting & Error Handling

- **Retry Logic**: Exponential backoff for 503/429 errors
- **Fallback**: Falls back to ATOM feed if JSON endpoint fails
- **Timeout**: 30-second timeout for document fetches
- **User-Agent**: Required header (`Short Seller Research Tool gdwoods@gmail.com`)

---

## Technology Stack

### Backend (Python)

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Runtime |
| requests | ≥2.31.0 | HTTP client for SEC API |
| pandas | ≥2.0.0 | Data manipulation, CSV handling |
| beautifulsoup4 | ≥4.12.0 | HTML parsing for filing documents |
| python-dateutil | ≥2.8.2 | Date parsing and timezone handling |
| supabase | ≥2.0.0 | PostgreSQL client for Supabase |
| lxml | ≥4.9.0 | Optional fast XML parser for RSS feeds |

### Frontend (Next.js)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.0 | React framework with SSR/SSG |
| React | 19.1.0 | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.1.14 | Utility-first CSS framework |
| @supabase/supabase-js | 2.39.0 | Client-side Supabase client |
| lucide-react | 0.544.0 | Icon library |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL database, Row Level Security |
| Vercel | Next.js hosting and deployment |
| GitHub Actions | Automated scanning via cron schedule |

---

## System Components

### Python Modules

#### `config.py`
- **Purpose**: Central configuration file
- **Contents**:
  - SEC API endpoints and headers
  - Relevant form types list
  - Red flag keywords
  - Target underwriter names
- **Usage**: Imported by all scraper modules

#### `universe_builder.py`
- **Purpose**: Build and maintain company universe database
- **Functions**:
  - `fetch_company_tickers()` - Download from SEC JSON endpoint
  - `save_universe_to_csv()` - Persist to CSV
  - `load_universe()` - Load into pandas DataFrame
- **Output**: `data/company_universe.csv` with columns: CIK, Ticker, Company_Name

#### `filing_scanner.py`
- **Purpose**: Discover new SEC filings
- **Functions**:
  - `fetch_latest_filings()` - Get filings from SEC JSON/ATOM feed
  - `scan_filings_by_form_type()` - Query specific form types
  - `enrich_filings_with_tickers()` - Match CIK to ticker symbols
- **Output**: List of filing dictionaries with CIK, form type, date, link

#### `filing_parser.py`
- **Purpose**: Extract structured data from filing documents
- **Functions**:
  - `fetch_filing_document()` - Download full HTML/text document
  - `parse_filing_details()` - Extract offering amount, shares, price, etc.
  - `extract_warrants_info()` - Find warrant coverage percentages
  - `extract_overallotment_info()` - Find overallotment/Green Shoe options
  - `extract_registration_number()` - Extract S-1 registration number for amendments
  - `find_original_s1_filing()` - Lookup original S-1 when amendment lacks data
- **Extraction Methods**:
  - **Regex patterns** for structured data (amounts, percentages, counts)
  - **Context-aware matching** (proximity to keywords like "aggregate offering price")
  - **Validation ranges** ($10M-$500M for base offerings)
  - **Multi-pass parsing** (try multiple patterns, prioritize by context)

#### `signal_extractor.py`
- **Purpose**: Detect short-seller red flags using SignalExtractor class
- **Class Methods**:
  - `extract_offering_amount()` - Find "cap raise" amount using regex
  - `extract_toxic_debt()` - Detect high interest rates (≥12%) on notes/debentures
  - `extract_management_turnover()` - Find executive resignations (past-tense verbs)
  - `extract_warrant_coverage()` - Extract warrant coverage percentages
- **Pattern Matching**:
  - Uses regex with context windows (e.g., "within 200 chars of 'resigned'")
  - Filters out boilerplate language (e.g., resignation policies)
  - Returns boolean flags + text snippets for verification

#### `analyzer.py`
- **Purpose**: Orchestrate filing analysis and risk scoring
- **Functions**:
  - `analyze_filings()` - Process list of filings
  - `search_for_red_flags()` - Keyword matching against config
  - `search_for_underwriters()` - Detect toxic underwriters with context
  - `calculate_risk_score()` - Compute weighted risk score
- **Integration**: Calls `signal_extractor.py` for advanced signals

#### `price_filter.py`
- **Purpose**: Filter filings by stock price threshold and fetch current stock prices
- **Functions**:
  - `fetch_current_stock_price()` - Fetch current price via Yahoo Finance (yfinance library or HTML scraping)
  - `check_filing_price_filter()` - Filter filings where price < threshold
  - `fetch_share_price_from_filing()` - Extract share price from filing text
- **Usage**: Pre-filtering to focus on low-priced stocks (common dilution targets), price tracking for dilution impact analysis

#### `update_price_7days.py`
- **Purpose**: Update price_7days_later for filings that are 7+ days old
- **Functions**:
  - `update_price_tracking()` - Finds filings ≥7 days old without 7-day price, fetches current price, updates database
- **Usage**: Called automatically on each scanner run to populate 7-day prices for older filings

#### `main.py`
- **Purpose**: Main entry point and orchestration
- **Functions**:
  - `run_scanner()` - Full pipeline execution
  - **Pipeline Steps**:
    1. Build/refresh company universe
    2. Scan latest filings (general feed + form-type-specific)
    3. Filter by price (optional, default < $20)
    4. Parse filing details
    5. Analyze for red flags and signals
    6. Calculate risk scores
    7. Fetch price_at_filing for new filings (preserves existing prices)
    8. Update price_7days_later for filings 7+ days old
    9. Save to CSV + Supabase (dual-write)

#### `supabase_storage.py`
- **Purpose**: Database interaction layer
- **Functions**:
  - `init_supabase()` - Initialize Supabase client
  - `save_company_universe_to_db()` - Upsert company data
  - `save_alerts_to_db()` - Insert/upsert filing alerts
- **Error Handling**: Converts NaN to None, handles duplicates via upsert

### Frontend Components

#### `app/page.tsx` (Main Dashboard)
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Features**:
  - Auto-refresh polling (15s intervals with random variance)
  - Client-side filtering
  - Watchlist integration
  - Sound alerts for new filings
  - Theme toggle (dark/light mode)
- **Data Flow**: Fetches from `/api/alerts` → filters client-side → displays in table

#### `app/api/alerts/route.ts` (API Route)
- **Purpose**: Server-side Supabase query for dilution alerts
- **Endpoints**: GET with query parameters (ticker, formType, minRiskScore, daysBack, limit)
- **Sorting**: Primary by date, secondary by filing_datetime
- **Filtering**: Excludes UNKNOWN tickers, applies query filters
- **Returns**: Array of DilutionAlert objects with all fields including price tracking

#### `app/api/company/[ticker]/route.ts` (API Route)
- **Purpose**: Fetch company-specific statistics and filing sequence
- **Endpoints**: GET `/api/company/[ticker]`
- **Returns**: CompanyStats object with:
  - Total filings, average/max risk scores
  - Total offering amount, unique underwriters
  - Form type breakdown
  - Chronological filing sequence
- **Error Handling**: Returns 404 if no filings found for ticker

#### `app/api/underwriters/route.ts` (API Route)
- **Purpose**: Fetch underwriter analytics and statistics
- **Endpoints**: GET `/api/underwriters`
- **Returns**: Array of UnderwriterStats objects with:
  - Filing count, risk score statistics
  - Unique companies count
  - Total offering amount
  - Recent activity (last 30 days)

#### `app/api/analytics/route.ts` (API Route)
- **Purpose**: Fetch aggregated data for charts
- **Endpoints**: GET with query parameters (type, daysBack, ticker)
- **Types**: `risk-distribution`, `offering-trends`, `filing-timeline`
- **Returns**: Structured data for Recharts components
- **Aggregations**: Performs SQL aggregations in Supabase queries

#### `app/api/check-price/route.ts` (API Route)
- **Purpose**: Check stock price for watchlist validation
- **Endpoints**: GET with query parameter (ticker)
- **Returns**: Current stock price from Yahoo Finance
- **Usage**: Used by watchlist to warn users about $20 threshold

#### `components/AlertTable.tsx`
- **Purpose**: Display alerts in tabular format
- **Features**:
  - Star icon for watchlist toggle
  - Form type tooltips
  - Date/time display
  - Risk score color coding
  - Price column showing price_at_filing and price_7days_later with percentage change
  - Flag badges (Toxic Debt, Resignation, Warrants, Underwriter)

#### `components/AlertFilters.tsx`
- **Purpose**: Filter controls
- **Filters**: Ticker search, form type, days back, watchlist only, min risk score
- **Bonus**: Manual ticker input for watchlist

#### `components/AlertDetailModal.tsx`
- **Purpose**: Detailed view of single filing
- **Content**: All extracted fields, risk score explanation, flag snippets

#### `components/QuickStartModal.tsx`
- **Purpose**: Getting started guide for new users
- **Content**: Feature overview, risk score explanation, usage tips

#### `app/page.tsx` (Main Dashboard)
- **Purpose**: Main alerts dashboard with real-time updates
- **Features**:
  - Auto-refresh polling (15s intervals with random variance)
  - Supabase Realtime integration (with polling fallback)
  - Client-side filtering
  - Watchlist integration
  - Sound alerts for new filings
  - Theme toggle (dark/light mode)
  - Navigation links to other pages
- **State Management**: React hooks (useState, useEffect, useCallback, useRef)
- **Data Flow**: Fetches from `/api/alerts` → filters client-side → displays in table

#### `app/company/[ticker]/page.tsx` (Company Profile)
- **Purpose**: Display company-specific filing history and statistics
- **Features**:
  - Company statistics (total filings, risk scores, offering amounts)
  - Filing timeline visualization
  - Form type breakdown
  - Complete filings table for the ticker
- **Data Sources**: `/api/company/[ticker]` and `/api/alerts?ticker=[ticker]`
- **Navigation**: Accessible by clicking ticker in alerts table

#### `app/underwriters/page.tsx` (Underwriter Analytics)
- **Purpose**: Display statistics on underwriters
- **Features**:
  - Underwriter statistics table
  - Sortable columns
  - Color-coded risk scores
  - Links back to main dashboard
- **Data Source**: `/api/underwriters`

#### `app/analytics/page.tsx` (Analytics & Charts)
- **Purpose**: Display data visualizations and charts
- **Features**:
  - Time period filter (30, 60, 90, 180, 365 days, all time)
  - Three chart components:
    - Risk Score Distribution Chart
    - Offering Trends Chart
    - Filing Timeline Chart
- **Data Source**: `/api/analytics` with type parameter

#### `app/education/page.tsx`
- **Purpose**: Educational content about SEC filings
- **Content**: Filing type descriptions, implications, timeline diagrams

#### `lib/watchlist.ts`
- **Purpose**: Watchlist management utilities
- **Functions**:
  - `getUserId()` - Generate/store anonymous UUID in localStorage
  - `getWatchlist()` - Fetch all watched tickers from Supabase
  - `toggleWatchlist()` - Add/remove ticker
- **Storage**: Supabase `user_watchlists` table keyed by user_id (UUID)

#### `hooks/useRealtimeAlerts.ts`
- **Purpose**: React hook for Supabase Realtime subscriptions
- **Features**:
  - Subscribes to INSERT events on `sec_filing_alerts` table
  - Automatic reconnection with exponential backoff
  - Connection status tracking (connecting, connected, disconnected, error, unavailable)
  - Graceful fallback if Supabase not configured
  - Callback-based alert handling
- **Usage**: Used in main dashboard for instant updates

#### `components/charts/RiskScoreDistributionChart.tsx`
- **Purpose**: Bar chart showing risk score distribution
- **Library**: Recharts (BarChart)
- **Data**: Aggregated from `/api/analytics?type=risk-distribution`
- **Features**: Shows count of filings in each risk range (0-4, 5-9, 10-14, 15+)

#### `components/charts/OfferingTrendsChart.tsx`
- **Purpose**: Line chart showing offering amount trends over time
- **Library**: Recharts (LineChart)
- **Data**: Aggregated from `/api/analytics?type=offering-trends`
- **Features**: Monthly aggregation, shows average offering amount and filing count

#### `components/charts/FilingTimelineChart.tsx`
- **Purpose**: Timeline visualization of filing sequences
- **Library**: Recharts (custom timeline)
- **Data**: Aggregated from `/api/analytics?type=filing-timeline`
- **Features**: Shows filing progression (S-1/S-3 → EFFECT → 424B4/424B5) for top tickers

---

## Database Schema

### Supabase PostgreSQL Tables

#### `company_universe`
```sql
CREATE TABLE company_universe (
    id BIGSERIAL PRIMARY KEY,
    cik TEXT NOT NULL UNIQUE,          -- SEC Central Index Key
    ticker TEXT,                        -- Stock ticker symbol
    title TEXT,                         -- Company name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_company_universe_cik ON company_universe(cik);
CREATE INDEX idx_company_universe_ticker ON company_universe(ticker);
```

**Purpose**: Maps SEC CIKs to ticker symbols for filing enrichment.

#### `sec_filing_alerts`
```sql
CREATE TABLE sec_filing_alerts (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,                 -- Filing date (YYYY-MM-DD)
    filing_datetime TIMESTAMP WITH TIME ZONE, -- Full timestamp (includes time)
    ticker TEXT NOT NULL,                -- Stock ticker
    form_type TEXT NOT NULL,             -- SEC form type (S-1, S-3, etc.)
    link_to_filing TEXT,                 -- URL to SEC filing
    
    -- Red Flags (boolean)
    warrants_found BOOLEAN DEFAULT FALSE,
    toxic_debt_detected BOOLEAN DEFAULT FALSE,
    management_turnover BOOLEAN DEFAULT FALSE,
    has_warrants BOOLEAN,                -- Structured warrant detection
    
    -- Text Fields
    underwriter_found TEXT,              -- Underwriter name if detected
    red_flags_found TEXT,                -- Comma-separated keywords found
    toxic_debt_snippet TEXT,             -- Text snippet for toxic debt
    resignation_snippet TEXT,            -- Text snippet for resignation
    
    -- Risk Scoring
    risk_score INTEGER DEFAULT 0,        -- Calculated risk score (0-20+)
    
    -- Offering Details
    cap_raise_amount NUMERIC,            -- Total capital raise
    base_offering_amount TEXT,           -- Base offering (from filing parser)
    offering_amount TEXT,                -- Legacy field (backward compatibility)
    share_price TEXT,                    -- Price per share
    number_of_shares TEXT,               -- Shares offered
    overallotment_shares TEXT,           -- Green Shoe option shares
    overallotment_amount TEXT,           -- Overallotment dollar amount
    private_placement_shares TEXT,       -- Private placement shares
    private_placement_amount TEXT,       -- Private placement dollar amount
    additional_dilutions TEXT,           -- Summary of additional dilutions
    
    -- Warrant Details
    warrant_coverage TEXT,               -- Warrant coverage percentage
    warrants_per_share TEXT,             -- Warrants per share
    
    -- Price Tracking
    price_at_filing NUMERIC(10, 4),      -- Stock price at filing time (captured when first detected)
    price_7days_later NUMERIC(10, 4),    -- Stock price 7 days after filing date (captured on subsequent scans)
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(ticker, date, form_type)      -- Prevent duplicates
);

CREATE INDEX idx_sec_filing_alerts_date ON sec_filing_alerts(date DESC);
CREATE INDEX idx_sec_filing_alerts_ticker ON sec_filing_alerts(ticker);
CREATE INDEX idx_sec_filing_alerts_risk_score ON sec_filing_alerts(risk_score DESC);
CREATE INDEX idx_sec_filing_alerts_form_type ON sec_filing_alerts(form_type);
CREATE INDEX idx_price_tracking_update ON sec_filing_alerts(date) WHERE price_7days_later IS NULL;
```

**Purpose**: Stores parsed filing data and analysis results.

#### `user_watchlists`
```sql
CREATE TABLE user_watchlists (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,               -- Anonymous UUID (from localStorage)
    ticker TEXT NOT NULL,                -- Ticker symbol
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, ticker)              -- One watchlist entry per user/ticker
);

CREATE INDEX idx_user_watchlists_user_id ON user_watchlists(user_id);
CREATE INDEX idx_user_watchlists_ticker ON user_watchlists(ticker);

-- Row Level Security (RLS)
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on user_watchlists"
ON user_watchlists FOR ALL USING (true) WITH CHECK (true);
```

**Purpose**: User-specific ticker watchlists (anonymous tracking via UUID).

### Data Flow

1. **Python Scraper** → Writes to Supabase via `supabase_storage.py`
2. **Next.js API Route** → Reads from Supabase via `@supabase/supabase-js`
3. **Frontend** → Queries API route, filters client-side

---

## API & Data Flow

### Python → Supabase

**Write Path**:
```
main.py → supabase_storage.py → Supabase PostgreSQL
```

**Operations**:
- `upsert()` for company_universe (handle duplicates)
- `upsert()` for sec_filing_alerts (UNIQUE constraint on ticker+date+form_type)
- `insert()` for new watchlist entries (handled by frontend)

### Frontend → Supabase (via API Route)

**Read Path**:
```
Browser → /api/alerts → Supabase Client → PostgreSQL → JSON Response → Frontend
```

**API Endpoints**:

#### `/api/alerts` (GET)
- **Query Parameters**:
  - `ticker` - Filter by ticker symbol
  - `formType` - Filter by form type (S-1, S-3, etc.)
  - `minRiskScore` - Minimum risk score threshold
  - `daysBack` - Limit to last N days
  - `limit` - Max results (default: 500)

#### `/api/company/[ticker]` (GET)
- **Path Parameter**: `ticker` - Stock ticker symbol
- **Returns**: CompanyStats object with statistics and filing sequence

#### `/api/underwriters` (GET)
- **Returns**: Array of UnderwriterStats objects

#### `/api/analytics` (GET)
- **Query Parameters**:
  - `type` - Chart type: `risk-distribution`, `offering-trends`, `filing-timeline`
  - `daysBack` - Time period filter (optional)
  - `ticker` - Filter by specific ticker (optional)
- **Returns**: Structured data for chart components

#### `/api/check-price` (GET)
- **Query Parameters**:
  - `ticker` - Stock ticker symbol
- **Returns**: Current stock price (number)

**Response Format**:
```json
{
  "alerts": [
    {
      "id": 123,
      "date": "2026-01-16",
      "filing_datetime": "2026-01-16T14:30:00Z",
      "ticker": "RVRC",
      "form_type": "S-1/A",
      "risk_score": 10,
      "toxic_debt_detected": true,
      ...
    }
  ]
}
```

---

## Risk Scoring Algorithm

### Score Calculation

Risk scores are calculated using a **weighted additive model**:

```python
risk_score = 0

# Base keyword matching (+1 per keyword)
risk_score += len(red_flags_found.split(", "))  # Each keyword = +1

# Underwriter detection (+2 per toxic underwriter)
if underwriter_found:
    risk_score += 2

# Signal extractor signals
if toxic_debt_detected:
    risk_score += 3  # High interest debt = +3

if management_turnover:
    risk_score += 4  # Executive resignation = +4

if warrant_coverage and parse_percentage(warrant_coverage) >= 100:
    risk_score += 2  # High warrant coverage = +2
```

### Scoring Breakdown

| Signal | Points | Description |
|--------|--------|-------------|
| Red Flag Keyword | +1 each | Keywords like "Warrant", "Convertible Note", "ATM" |
| Toxic Underwriter | +2 each | Maxim, Wainwright, Aegis Capital detected |
| Toxic Debt | +3 | Interest rate ≥12% on notes/debentures |
| Management Turnover | +4 | Executive resignation detected |
| Warrant Coverage ≥100% | +2 | Warrant coverage percentage ≥100% |

### Risk Levels

- **0-4**: Low risk
- **5-9**: Moderate risk
- **10-14**: High risk
- **15+**: Very high risk

### Example Calculation

```
Filing: S-1 with "Warrant", "Convertible Note" keywords
+ Toxic underwriter: Maxim Group
+ Toxic debt: 20% Notes
+ Warrant coverage: 150%

Score = 2 (keywords) + 2 (underwriter) + 3 (toxic debt) + 2 (high warrant coverage) = 9
```

---

## Signal Detection

### Keyword Matching (`analyzer.py`)

**Process**:
1. Fetch full filing document HTML/text
2. Lowercase text for case-insensitive matching
3. Check for red flag keywords from `config.py`
4. Count matches, store as comma-separated string

**Keywords Tracked**:
- "warrant"
- "convertible note"
- "convertible debenture"
- "at-the-market"
- "equity line of credit"
- "common stock purchase agreement"

### Toxic Debt Detection (`signal_extractor.py`)

**Regex Pattern**:
```regex
([1-9][0-9])%  # Interest rate ≥10%
```

**Context Check**:
- Must appear within 200 characters of: "Note", "Debenture", "Promissory"
- Filters out: percentages in other contexts (e.g., "5% stake")

**Threshold**: Interest rate ≥12% triggers flag

**Output**: Boolean `toxic_debt_detected` + text snippet

### Management Turnover Detection (`signal_extractor.py`)

**Pattern Matching**:
- **Past-tense verbs**: "resigned", "has resigned", "tendered resignation"
- **Titles**: "CFO", "Chief Financial Officer", "CEO", "Auditor"
- **Context window**: Within 100 characters

**Exclusions** (boilerplate filtering):
- "shall promptly tender his or her conditional resignation"
- "director shall resign"
- Future-tense policy language

**Output**: Boolean `management_turnover` + text snippet

### Underwriter Detection (`analyzer.py`)

**Target Underwriters**:
- Maxim Group / Maxim Group LLC
- H.C. Wainwright & Co.
- Aegis Capital Corp.

**Context Requirement**:
- Must appear within 200 characters of: "as underwriter", "underwritten by", "serving as"
- Filters out: incidental mentions (e.g., "maximum" matching "maxim")

**Output**: String `underwriter_found` (underwriter name or None)

### Warrant Coverage Extraction (`signal_extractor.py`)

**Patterns**:
- "warrant coverage of X%"
- "X% warrant coverage"
- "warrants to purchase X% of"

**Parsing**: Regex extracts percentage, validates numeric range

**Output**: String `warrant_coverage` (e.g., "100%", "150%")

---

## Deployment & Infrastructure

### Python Scraper Deployment

#### GitHub Actions Workflow (`.github/workflows/scan-sec-filings.yml`)

**Schedule**:
- **Market Hours** (4 AM - 8 PM ET, Mon-Fri): Every 1 minute
- **Off-Hours** (8 PM - 4 AM ET, Mon-Fri): Every 15 minutes
- **Weekends**: Every 15 minutes

**Execution**:
```yaml
steps:
  - Checkout code
  - Set up Python 3.11
  - Install dependencies (requirements.txt)
  - Configure environment (Supabase credentials)
  - Run: python3 main.py --filing-count 50
```

**Secrets Required**:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Next.js Web App Deployment (Vercel)

**Configuration**:
- **Framework**: Next.js
- **Root Directory**: `web/`
- **Build Command**: `npm run build`
- **Output Directory**: `.next/`

**Environment Variables** (Vercel Dashboard):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Auto-Deploy**: Triggers on push to `main` branch

### Supabase Setup

**Provisioning**:
1. Create Supabase project
2. Run SQL schema (`create_supabase_tables.sql`)
3. Configure Row Level Security (RLS) policies
4. Set environment variables in GitHub/Vercel

**Database Features Used**:
- PostgreSQL 15+
- Row Level Security (RLS) for watchlists
- Indexes on date, ticker, risk_score, form_type
- Unique constraints for deduplication

---

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Supabase account
- Git

### Backend Setup

```bash
# Clone repository
git clone <repo-url>
cd sec_scraper

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"

# Run scanner
python main.py --filing-count 50
```

### Frontend Setup

```bash
cd web

# Install dependencies
npm install

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF

# Run development server
npm run dev

# Open http://localhost:3000
```

### Database Setup

```bash
# Run SQL schema in Supabase SQL Editor
# Copy contents of create_supabase_tables.sql and execute
```

---

## Configuration

### Python Configuration (`config.py`)

```python
# SEC API Headers (required)
SEC_HEADERS = {
    "User-Agent": "Short Seller Research Tool gdwoods@gmail.com",
    "Accept": "application/json, text/plain, */*",
}

# Relevant Form Types
RELEVANT_FORM_TYPES = ["S-1", "S-3", "424B4", "424B5", "8-K", "EFFECT"]

# Red Flag Keywords
RED_FLAG_KEYWORDS = ["warrant", "convertible note", ...]

# Target Underwriters
TARGET_UNDERWRITERS = ["Maxim", "Wainwright", "Aegis"]
```

### Next.js Configuration

**`next.config.ts`**:
```typescript
// Minimal config - Next.js 16 defaults work well
```

**`tailwind.config.js`**:
```javascript
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
};
```

### Environment Variables

**Backend** (Python):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

**Frontend** (Next.js):
- `NEXT_PUBLIC_SUPABASE_URL` - Must be prefixed with `NEXT_PUBLIC_` for client-side access
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

---

## File Structure

```
sec_scraper/
├── .github/
│   └── workflows/
│       └── scan-sec-filings.yml    # GitHub Actions automation
├── data/
│   ├── company_universe.csv        # Local backup of company data
│   └── dilution_alerts.csv         # Local backup of alerts
├── web/
│   ├── app/
│   │   ├── api/
│   │   │   └── alerts/
│   │   │       └── route.ts        # Next.js API route
│   │   ├── education/
│   │   │   └── page.tsx            # Education page
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Main dashboard
│   │   └── globals.css             # Global styles
│   ├── components/
│   │   ├── AlertDetailModal.tsx    # Filing detail modal
│   │   ├── AlertFilters.tsx        # Filter controls
│   │   ├── AlertTable.tsx          # Alerts table
│   │   ├── FormTypeTooltip.tsx     # Tooltip component
│   │   ├── QuickStartModal.tsx     # Getting started guide
│   │   └── ThemeToggle.tsx         # Dark/light mode toggle
│   ├── lib/
│   │   ├── alertUtils.ts           # Alert utility functions
│   │   ├── formTypeDescriptions.ts # Form type descriptions
│   │   ├── supabase.ts             # Supabase client
│   │   ├── utils.ts                # General utilities
│   │   └── watchlist.ts            # Watchlist utilities
│   ├── types/
│   │   └── alert.ts                # TypeScript type definitions
│   ├── package.json                # NPM dependencies
│   ├── tailwind.config.js          # Tailwind CSS config
│   └── tsconfig.json               # TypeScript config
├── analyzer.py                     # Filing analysis and risk scoring
├── config.py                       # Configuration constants
├── create_supabase_tables.sql      # Database schema
├── add_price_tracking_columns.sql  # SQL schema for price tracking
├── filing_parser.py                # Filing document parsing
├── filing_scanner.py               # SEC filing discovery
├── main.py                         # Main entry point
├── price_filter.py                 # Stock price filtering
├── update_price_7days.py           # 7-day price tracking updates
├── requirements.txt                # Python dependencies
├── signal_extractor.py             # Advanced signal detection
├── supabase_storage.py             # Database interaction
└── universe_builder.py             # Company universe management
├── signal_extractor.py             # Advanced signal detection
├── supabase_storage.py             # Database interaction
└── universe_builder.py             # Company universe management
```

---

## Performance Considerations

### Python Scraper

**Optimizations**:
- **Caching**: Company universe loaded once, reused across filings
- **Batch Processing**: Process multiple filings in single run
- **Rate Limiting**: `time.sleep()` between SEC requests (respects SEC guidelines)
- **Early Exit**: Price filter skips parsing if stock price too high

**Bottlenecks**:
- **Document Fetching**: Large filings (10-40MB HTML) can take 5-10 seconds
- **Regex Parsing**: Complex patterns on large text (mitigated by context windows)
- **Supabase Writes**: Batch inserts reduce API calls

**Estimated Runtime**:
- 50 filings: ~5-10 minutes (depends on document sizes)

### Frontend

**Optimizations**:
- **Client-Side Filtering**: Reduces API calls, instant updates
- **Memoization**: `useCallback` for stable function references
- **Lazy Loading**: Components loaded on demand (modals)
- **Efficient Re-renders**: React state management minimizes unnecessary renders

**Polling Strategy**:
- **Interval**: 15 seconds ± 2 seconds (random variance to avoid rate limiting)
- **Smart Updates**: Only re-render when new alerts detected (compare IDs)
- **Pause/Resume**: User can pause auto-refresh to reduce load

**Sound Alerts**:
- **Technology**: Web Audio API (browser-native, no external dependencies)
- **Detection**: Compares alert IDs to detect new filings
- **Options**: 6 built-in sound types (beep, low pitch, high pitch, double beep, triple beep, chime)
- **Storage**: Preferences saved in localStorage (enable/disable, selected sound)
- **Playback**: Generates sounds dynamically using AudioContext and OscillatorNode
- **Timing**: Only plays on new alert detection (not on manual refresh)

**Supabase Realtime**:
- **Technology**: Supabase Realtime (WebSocket-based)
- **Subscription**: Subscribes to INSERT events on `sec_filing_alerts` table
- **Connection Management**: Automatic reconnection with exponential backoff (max 5 attempts)
- **Status Tracking**: Shows connection status in UI (connecting, connected, disconnected, error)
- **Fallback**: Automatically falls back to polling if Realtime unavailable
- **Implementation**: Custom React hook (`useRealtimeAlerts`) with ref-based callbacks
- **Performance**: Instant updates without polling overhead when connected

**API Caching**:
- Next.js API routes cache responses (default 60s)
- Supabase query caching (when enabled)

---

## Security & Compliance

### SEC EDGAR Compliance

**User-Agent Header**:
- Required by SEC.gov terms of service
- Must identify requester (name + email)
- Current: `"Short Seller Research Tool gdwoods@gmail.com"`

**Rate Limiting**:
- No official SEC rate limit published
- Best practice: 1 request per second, add delays between batches
- Retry logic handles 503 errors gracefully

### Data Privacy

**User Watchlists**:
- Anonymous tracking via UUID (generated in browser localStorage)
- No personally identifiable information collected
- Row Level Security (RLS) allows all operations (users isolated by UUID)

**Supabase Security**:
- Uses `anon` key (read/write limited by RLS policies)
- No service role key exposed to client
- Environment variables stored securely (Vercel/GitHub Secrets)

### API Security

**Next.js API Routes**:
- Server-side only (not exposed to client)
- No authentication required (public data)
- Input validation on query parameters

### Error Handling

**Graceful Degradation**:
- Empty error objects suppressed (table doesn't exist yet)
- Fallback to CSV if Supabase unavailable
- Client-side error boundaries prevent crashes

---

## Algorithm Details

### Filing Document Parsing

**Multi-Pass Approach**:
1. **Fetch**: Download full HTML document
2. **Extract**: BeautifulSoup4 extracts text (removes HTML tags)
3. **Search**: Regex patterns applied to text
4. **Validate**: Check extracted values against expected ranges
5. **Context**: Prefer matches near relevant keywords

**Example: Offering Amount Extraction**

```python
# Pattern 1: "Proposed Maximum Aggregate Offering Price: $15,000,000"
pattern1 = r'\$([0-9,]+(\.[0-9]{2})?)'

# Pattern 2: "Gross Proceeds of $15,000,000"
pattern2 = r'Gross Proceeds.*?\$([0-9,]+(\.[0-9]{2})?)'

# Context: Must be near "offering" or "aggregate"
context = r'(?=.*(?:offering|aggregate|proceeds))'

# Validation: $10M - $500M range
if 10_000_000 <= amount <= 500_000_000:
    return amount
```

### Amendment Handling (S-1/A)

**Problem**: S-1/A amendments may lack offering details (reference original S-1)

**Solution**:
1. Parse current filing for registration number
2. Search SEC filings by CIK + form type "S-1"
3. Match by registration number (filing number)
4. Recursively parse original S-1
5. Merge data (prioritize original S-1 for missing fields)

**Implementation**: `filing_parser.py::find_original_s1_filing()`

### Price Tracking

**Purpose**: Track stock price impact of dilution events over time

**Implementation**:
1. **At Filing Price Capture**:
   - When filing is first detected, check if `price_at_filing` already exists in database
   - If new filing (no existing price), fetch current stock price from Yahoo Finance
   - Store in `price_at_filing` column
   - If existing filing found, preserve original `price_at_filing` (don't overwrite)

2. **7-Day Price Updates**:
   - On each scanner run, query filings where `date <= 7_days_ago` AND `price_7days_later IS NULL`
   - For each qualifying filing, fetch current stock price
   - Update `price_7days_later` column
   - Group by ticker to avoid redundant price fetches

**Modules**:
- `main.py` - Orchestrates price_at_filing capture (checks DB first, preserves existing)
- `update_price_7days.py` - Handles 7-day price updates
- `price_filter.py` - Provides `fetch_current_stock_price()` using yfinance library

**Database Schema**:
```sql
price_at_filing NUMERIC(10, 4),      -- Stock price at filing time
price_7days_later NUMERIC(10, 4),    -- Stock price 7 days later
```

**Index**: `idx_price_tracking_update` on `date` WHERE `price_7days_later IS NULL` for efficient querying

**Frontend Display**:
- Price column shows both prices with color coding (green for gains, red for losses)
- Percentage change calculated automatically: `((price_7days_later - price_at_filing) / price_at_filing * 100)`
- "Pending..." shown for filings < 7 days old

### Deduplication Strategy

**Database Level**:
- `UNIQUE(ticker, date, form_type)` constraint prevents duplicate alerts
- `upsert()` operations update existing records

**Application Level**:
- Combine general feed + form-type-specific feeds
- Deduplicate by `link_to_filing` URL before insertion

---

## Future Enhancements

**Potential Improvements**:
1. **Email/SMS alerts** for watchlist tickers
2. **ML-based signal detection** (improve accuracy)
3. **Multi-user authentication** (replace anonymous UUIDs)
4. **Export functionality** (CSV/PDF reports)
5. **API for external integrations**
6. **Backtesting** dilution prediction accuracy
7. **Historical price data** (more accurate price_at_filing using historical prices)
8. **Additional chart types** (underwriter trends, form type distribution)
9. **Alert notifications** (browser push notifications)
10. **Advanced filtering** (date ranges, multiple tickers, custom risk ranges)

---

## License & Attribution

**SEC Data**: Public domain (SEC EDGAR filings)

**Code**: Proprietary

**Third-Party Services**:
- Supabase (database hosting)
- Vercel (web hosting)
- GitHub Actions (automation)

---

## Support & Contributing

**Issues**: Report via GitHub Issues

**Contributions**: Pull requests welcome

**Documentation**: This file serves as primary technical reference

---

**Last Updated**: January 2026  
**Version**: 1.1.0  
**Maintainer**: gdwoods@gmail.com
