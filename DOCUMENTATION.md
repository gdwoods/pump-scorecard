# SEC Dilution Alerts - User Documentation

## Overview

SEC Dilution Alerts is an automated monitoring system designed to help traders, short sellers, and financial analysts identify and track potential dilution events in publicly traded US companies. The system continuously scans SEC EDGAR filings in real-time, extracts key offering details, and flags short-seller red flags to provide early warning of dilution risks.

### Key Features

- **Real-time Monitoring**: Automatically scans SEC filings every 1-15 minutes (depending on market hours)
- **Dilution Detection**: Identifies capital raises through equity offerings (S-1, S-3, 424B4, 424B5 filings)
- **Red Flag Analysis**: Detects toxic debt, management turnover, toxic underwriters, and warrant coverage
- **Risk Scoring**: Calculates a risk score (0-20+) based on multiple signals
- **Ticker Watchlists**: Personal watchlists for monitoring specific companies
- **Web Dashboard**: Modern, responsive interface with filtering, sorting, and alerts
- **Sound Alerts**: Configurable audible notifications when new filings are detected
- **Education Resources**: Comprehensive guides on SEC filings and their implications

---

## What is Dilution?

**Stock dilution** occurs when a company issues additional shares, reducing the ownership percentage of existing shareholders. For short sellers and traders, dilution events are critical because:

1. **Increased Share Supply**: More shares in the market can depress stock prices
2. **Cash Desperation**: Companies often dilute when they need cash urgently (financial distress)
3. **Toxic Financing**: Some dilution mechanisms (convertible notes, warrants) can create ongoing selling pressure
4. **Timing Signals**: The sequence of filings (S-1 → EFFECT → 424B4) reveals when dilution will occur

This tool helps you identify these events **before** they fully impact the market.

---

## How It Works

### The Monitoring Pipeline

1. **Data Collection**: Python scraper automatically fetches latest SEC filings from EDGAR database
2. **Filing Discovery**: Filters for dilution-related forms (S-1, S-3, 424B4, 424B5, 8-K, EFFECT)
3. **Data Extraction**: Parses filing documents to extract offering details (amount, shares, price, warrants)
4. **Signal Detection**: Analyzes text for red flags (toxic debt, management changes, underwriters)
5. **Risk Calculation**: Assigns risk scores based on detected signals
6. **Storage**: Saves results to Supabase database (PostgreSQL)
7. **Display**: Web app fetches and displays alerts with filtering and search capabilities

### Real-Time Updates

- **Automated Scanning**: GitHub Actions runs the Python scraper on a schedule
  - **Market Hours** (4 AM - 8 PM ET, weekdays): Every 1 minute
  - **Off-Hours**: Every 15 minutes
- **Web App Polling**: Dashboard auto-refreshes every 15 seconds (±2s variance)
- **Notifications**: Optional sound alerts when new filings are detected

---

## SEC Filing Types Tracked

### Primary Dilution Filings

**S-1** - Initial Registration Statement
- **What it is**: Company's first filing to register new securities for sale
- **Why it matters**: Indicates company is actively seeking to raise capital
- **Timeline**: Typically effective 2-4 weeks after filing, then shares can be sold
- **Risk Level**: High - Dilution is imminent once effective

**S-3** - Shelf Registration Statement
- **What it is**: Pre-approved authorization for seasoned issuers to sell shares "off the shelf"
- **Why it matters**: Company can dilute at any time without additional SEC approval
- **Timeline**: Effective immediately, shares can be sold whenever company chooses
- **Risk Level**: High - Continuous dilution risk

**424B4 / 424B5** - Prospectus Supplements
- **What it is**: Pricing and offering details for registered securities
- **Why it matters**: Shows actual dilution occurring - shares are being sold NOW
- **Timeline**: Filed when offering is priced, often same day as sale
- **Risk Level**: High - Active dilution happening

**EFFECT** - Notice of Effectiveness
- **What it is**: SEC declares a registration statement (S-1/S-3) effective
- **Why it matters**: This is the "green light" - company can now legally sell shares
- **Timeline**: Filed 2-4 weeks after S-1/S-3, dilution can begin immediately
- **Risk Level**: High - Critical trigger point

**8-K** - Current Report
- **What it is**: Announcement of significant corporate events
- **Why it matters**: May disclose financing arrangements or management changes before formal registration
- **Timeline**: Filed within 4 business days of event
- **Risk Level**: Medium - May signal upcoming dilution or red flags

See the [Education Page](/education) for detailed explanations of each filing type.

---

## Red Flags & Signals

The system detects several categories of short-seller red flags:

### 1. Toxic Debt (High Interest Rates)

**What it is**: Convertible notes or debentures with interest rates ≥12%

**Why it matters**: 
- Indicates company cannot access traditional financing
- High interest rates suggest financial distress
- Convertible notes can convert to equity, causing dilution

**Example**: "20% Notes with a face amount of $250,000"

**Risk Score Impact**: +3 points

### 2. Management Turnover (Executive Resignations)

**What it is**: CFO, CEO, or other executives resigning

**Why it matters**:
- Executive departures often precede bad news
- Can indicate internal problems or disagreements
- May signal upcoming financial distress

**Example**: "Ernest Scheidemann, Chief Financial Officer, resigned on February 25, 2025"

**Risk Score Impact**: +4 points

**Note**: System filters out boilerplate policy language (e.g., "director shall tender resignation") and only flags actual past-tense resignations.

### 3. Toxic Underwriters

**What it is**: Investment banks known for facilitating dilutive offerings

**Target Underwriters**:
- Maxim Group / Maxim Group LLC
- H.C. Wainwright & Co.
- Aegis Capital Corp.

**Why it matters**:
- These underwriters specialize in microcap financing
- Often associated with aggressive dilution programs
- Their involvement signals high dilution risk

**Risk Score Impact**: +2 points per underwriter

**Note**: System requires context (e.g., "as underwriter" or "underwritten by") to avoid false positives.

### 4. Warrant Coverage

**What it is**: Warrants attached to offerings, giving investors the right to buy additional shares

**Why it matters**:
- Warrants create future dilution potential
- Coverage ≥100% means warrants can double the offering size
- Warrant exercises create additional selling pressure

**Example**: "100% warrant coverage" means investors get warrants to purchase an equal number of shares

**Risk Score Impact**: +2 points if coverage ≥100%

### 5. Red Flag Keywords

**What they are**: Terms commonly associated with dilution mechanisms

**Keywords Tracked**:
- Warrant
- Convertible Note / Convertible Debenture
- At-the-market (ATM)
- Equity Line of Credit
- Common Stock Purchase Agreement

**Risk Score Impact**: +1 point per keyword found

---

## Risk Scoring System

### Score Calculation

Risk scores are calculated using a **weighted additive model**:

| Signal | Points | Description |
|--------|--------|-------------|
| Red Flag Keyword | +1 each | Each dilution-related keyword found |
| Toxic Underwriter | +2 each | Each toxic underwriter detected |
| Toxic Debt | +3 | Interest rate ≥12% on notes/debentures |
| Management Turnover | +4 | Executive resignation detected |
| Warrant Coverage ≥100% | +2 | High warrant coverage percentage |

### Risk Levels

- **0-4**: Low risk - Minimal dilution signals
- **5-9**: Moderate risk - Some dilution concerns
- **10-14**: High risk - Multiple red flags present
- **15+**: Very high risk - Aggressive dilution likely

### Example Calculation

A filing with:
- Keywords: "Warrant", "Convertible Note" (+2 points)
- Underwriter: Maxim Group (+2 points)
- Toxic Debt: 20% Notes (+3 points)
- Warrant Coverage: 150% (+2 points)

**Total Risk Score**: 9 (Moderate to High Risk)

---

## Technology Stack

### Backend (Python)

- **Language**: Python 3.11+
- **HTTP Client**: `requests` library for SEC API calls
- **Data Processing**: `pandas` for CSV/dataframe operations
- **HTML Parsing**: `beautifulsoup4` for extracting text from SEC filings
- **Database**: `supabase-py` client for PostgreSQL storage
- **Regex**: Built-in `re` module for pattern matching

**Key Modules**:
- `main.py` - Main orchestration script
- `filing_scanner.py` - Discovers new SEC filings
- `filing_parser.py` - Extracts structured data from filings
- `analyzer.py` - Detects red flags and calculates risk scores
- `signal_extractor.py` - Advanced signal detection (toxic debt, turnover)
- `supabase_storage.py` - Database interaction layer

### Frontend (Next.js)

- **Framework**: Next.js 16.1 (React-based, SSR/SSG support)
- **Language**: TypeScript 5.x for type safety
- **Styling**: Tailwind CSS 4.1 (utility-first CSS framework)
- **Database Client**: `@supabase/supabase-js` for client-side queries
- **Icons**: Lucide React (modern icon library)

**Key Components**:
- Main dashboard with alerts table
- Alert detail modal with full filing information
- Filters for ticker, form type, risk score, watchlist
- Watchlist management (add/remove tickers)
- Sound alerts with multiple sound options
- Quick start guide and education pages

### Database (Supabase PostgreSQL)

- **Database**: PostgreSQL 15+ (hosted on Supabase)
- **Tables**:
  - `company_universe` - CIK to ticker mappings
  - `sec_filing_alerts` - Filing data and analysis results
  - `user_watchlists` - User-specific ticker watchlists
- **Features**: Row Level Security (RLS), automatic backups, real-time subscriptions

### Infrastructure

- **Web Hosting**: Vercel (serverless Next.js hosting)
- **Database Hosting**: Supabase (managed PostgreSQL)
- **Automation**: GitHub Actions (cron-based scheduling)
- **Version Control**: Git/GitHub

---

## Data Sources

### SEC EDGAR API

The system uses publicly available SEC EDGAR (Electronic Data Gathering, Analysis, and Retrieval) data:

**Company Tickers**: `https://www.sec.gov/files/company_tickers.json`
- Complete mapping of SEC CIK (Central Index Key) to ticker symbols
- Updated periodically by SEC
- Used for enriching filings with ticker symbols

**Latest Filings Feed**: `https://www.sec.gov/cgi-bin/browse-edgar`
- Real-time feed of recent SEC filings
- Parameters: `action=getcurrent`, `output=atom` or `output=json`
- Historical window: ~1-2 days (feed only contains recent filings)
- Can filter by form type (e.g., `type=S-1`)

**Filing Documents**: Individual HTML/text documents
- URL pattern: `https://www.sec.gov/cgi-bin/viewer?action=view&cik={CIK}&accession_number={ACC_NO}`
- Format: HTML with embedded text (can be 10-40MB for large filings)
- Parsing: Extracts text using BeautifulSoup4, then applies regex patterns

### Data Processing

**Extraction Methods**:
- **Regex Patterns**: Context-aware matching (e.g., "within 200 chars of 'offering price'")
- **Validation Ranges**: Filters for realistic values ($10M-$500M for base offerings)
- **Multi-Pass Parsing**: Tries multiple patterns, prioritizes by context
- **Amendment Handling**: For S-1/A filings, looks up original S-1 if details missing

**Example Extraction Flow**:
1. Download full filing HTML document
2. Extract text using BeautifulSoup4
3. Search for patterns like "$15,000,000" near "offering price"
4. Validate extracted amount is in reasonable range
5. Store structured data in database

---

## Key Features Explained

### Watchlist Management

**Purpose**: Track specific tickers you're monitoring

**How It Works**:
- **Anonymous Tracking**: Each user gets a unique UUID stored in browser localStorage
- **Persistent Storage**: Watchlist saved in Supabase database
- **Two Ways to Add**:
  1. Click star icon (⭐) next to ticker in alerts table
  2. Type ticker in "Add Ticker to Watchlist" field in Filters section
- **Filtering**: Toggle "Watchlist Only" to see only filings for watched tickers

**Benefits**:
- Monitor tickers even if they don't have filings yet
- Get alerts when filings appear for watched tickers
- Watchlist summary shows all tickers (with/without filings)

### Auto-Refresh & Polling

**Web App Polling**:
- **Interval**: Every 15 seconds (±2s random variance)
- **Purpose**: Detect new filings in real-time
- **Smart Updates**: Only re-renders when new alerts detected (compares IDs)
- **Controls**: Users can pause/resume auto-refresh

**GitHub Actions Automation**:
- **Schedule**: 
  - Market hours (4 AM - 8 PM ET, weekdays): Every 1 minute
  - Off-hours: Every 15 minutes
- **Purpose**: Keep database updated with latest filings
- **Configuration**: See `.github/workflows/scan-sec-filings.yml`

### Sound Alerts

**Purpose**: Get audible notifications when new filings are detected

**How It Works**:
- **Automatic Detection**: System detects new filings by comparing alert IDs
- **Playback**: Uses Web Audio API to generate custom sounds in the browser
- **Configurable**: Enable/disable via toggle in header (bell icon)
- **Persistent**: Settings saved in browser localStorage

**Sound Options**:
1. **Default Beep** - Single tone beep (800 Hz)
2. **Low Pitch** - Lower frequency beep (400 Hz)
3. **High Pitch** - Higher frequency beep (1200 Hz)
4. **Double Beep** - Two sequential beeps
5. **Triple Beep** - Three sequential beeps
6. **Chime (Ascending)** - Ascending musical notes (600 Hz → 800 Hz → 1000 Hz)

**How to Use**:
1. Click bell icon (🔔) in header
2. Toggle "Sound Alerts" switch to enable
3. Select sound type from dropdown
4. Click "Test Sound" to preview
5. Sound will play automatically when new filings are detected

**When Alerts Play**:
- Only when new filings are added to the database
- Only when auto-refresh detects new alerts (not on manual refresh)
- Respects enable/disable toggle
- Uses selected sound option

**Browser Compatibility**: Requires modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge)

### Risk Score Display

**Color Coding**:
- **Red** (≥15): Very high risk - Aggressive dilution signals
- **Orange** (10-14): High risk - Multiple red flags
- **Yellow** (5-9): Moderate risk - Some concerns
- **Green** (0-4): Low risk - Minimal signals

**Detailed View**: Click on any alert to see:
- Risk score breakdown
- All detected red flags with text snippets
- Offering details (amount, shares, price)
- Warrant information
- Links to full SEC filing

### Filtering & Search

**Available Filters**:
- **Ticker**: Search for specific ticker symbol
- **Form Type**: Filter by filing type (S-1, S-3, 424B4, etc.)
- **Days Back**: Limit to last 7, 30, or 90 days
- **Watchlist Only**: Show only filings for tickers in your watchlist
- **Minimum Risk Score**: Filter by risk threshold (advanced)

**Client-Side Filtering**: Filters applied in browser for instant results (no API delay)

---

## Understanding the Filing Timeline

### Typical Dilution Sequence

1. **S-1 or S-3 Filed**
   - Company registers shares but cannot sell yet
   - **Status**: Registration pending SEC approval
   - **Action**: Monitor for effectiveness

2. **EFFECT Filed** (2-4 weeks later)
   - SEC declares registration effective
   - **Status**: Company can now legally sell shares
   - **Action**: High alert - dilution can begin immediately

3. **424B4 or 424B5 Filed** (within days of effectiveness)
   - Actual sale occurs - shares are being sold
   - **Status**: Active dilution happening
   - **Action**: Monitor for impact on stock price

### Amendments (S-1/A)

**What they are**: Updates or revisions to previously filed S-1

**Why they matter**:
- May increase or decrease offering size
- Can adjust pricing terms (often downward)
- May add or remove dilution mechanisms (warrants, convertibles)

**System Behavior**: For S-1/A filings missing details, system automatically looks up original S-1 and merges data.

---

## Best Practices

### For Monitoring Dilution

1. **Track the Sequence**: S-1 → EFFECT → 424B4 = active dilution
2. **Watch for Amendments**: S-1/A may increase offering size
3. **Monitor 8-K Filings**: May announce financing before formal registration
4. **EFFECT is Critical**: No dilution before effectiveness, but imminent after
5. **Multiple 424B5s**: Indicates active ATM selling - continuous dilution pressure

### For Using Watchlists

1. **Add Preemptively**: Add tickers you suspect might file, even before they do
2. **Monitor Regularly**: Check watchlist filter for new filings
3. **Enable Sound Alerts**: Click bell icon (🔔) in header, enable sound alerts, and select your preferred sound to be notified immediately when new filings are detected
4. **Combine with Filters**: Use watchlist + risk score filter to focus on high-risk alerts

### For Risk Assessment

1. **Consider Context**: Risk score is a starting point - review details
2. **Check Offering Amount**: Large offerings (>$50M) can have significant impact
3. **Review Warrant Terms**: High warrant coverage increases dilution potential
4. **Monitor Underwriters**: Toxic underwriters often signal aggressive programs
5. **Verify Signals**: Check text snippets to confirm red flags are real (not false positives)

---

## Limitations & Considerations

### Data Accuracy

- **Extraction Errors**: Automated parsing may miss or misinterpret some details
- **Amendment Handling**: Some S-1/A filings may lack full data if original S-1 not found
- **Price Filtering**: Stock price data from Yahoo Finance (unofficial API) may be delayed or inaccurate
- **Always Verify**: Review actual SEC filing documents for critical decisions

### Coverage

- **Historical Window**: SEC feed only contains last 1-2 days of filings
- **Form Types**: System focuses on dilution-related forms (S-1, S-3, 424B4, 424B5, 8-K, EFFECT)
- **US Companies Only**: System monitors US public companies (SEC EDGAR data)

### False Positives

- **Keyword Matching**: Broad keyword search may match unrelated contexts
- **Underwriter Detection**: May flag underwriter mentions in unrelated contexts (filtered but not perfect)
- **Management Turnover**: Boilerplate policy language filtered, but may miss edge cases

**Always review filing documents directly before making trading decisions.**

---

## Privacy & Data

### User Privacy

- **Anonymous Tracking**: Watchlists use anonymous UUIDs (no personal information collected)
- **No Account Required**: No registration or login needed
- **Local Storage**: User ID stored in browser localStorage (can be cleared anytime)
- **Supabase Security**: Row Level Security (RLS) policies ensure user data isolation

### Data Retention

- **Filing Data**: Stored indefinitely in Supabase database
- **Watchlists**: Persist until manually deleted by user
- **No Analytics**: No user behavior tracking or analytics collection

---

## Getting Help

### Resources

- **Quick Start Guide**: Click help icon (?) in header for getting started guide
- **Education Page**: Click book icon (📖) in header for detailed filing explanations
- **Alert Details**: Click any alert row or "Details" button for full filing information
- **Tooltips**: Hover over form types to see descriptions

### Support

- **GitHub Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: See `TECHNICAL_DOCUMENTATION.md` for technical details

---

## Technical Architecture (High-Level)

### System Components

1. **Python Scraper** (Backend)
   - Fetches SEC filings from EDGAR API
   - Parses filing documents to extract data
   - Detects red flags and calculates risk scores
   - Stores results in Supabase database

2. **Next.js Web App** (Frontend)
   - React-based dashboard
   - Fetches data from Supabase via API routes
   - Client-side filtering and sorting
   - Real-time auto-refresh polling

3. **Supabase Database** (Storage)
   - PostgreSQL database storing filing data
   - Row Level Security for watchlist privacy
   - Indexes for fast queries

### Deployment

- **Python Scraper**: Runs on GitHub Actions schedule (automated)
- **Web App**: Hosted on Vercel (auto-deploys from GitHub)
- **Database**: Hosted on Supabase (managed PostgreSQL)

### Data Flow

```
SEC EDGAR API → Python Scraper → Supabase Database → Next.js API Route → Frontend Display
```

---

## Frequently Asked Questions

**Q: How often does the system update?**
A: The scraper runs every 1-15 minutes (depending on market hours). The web app polls every 15 seconds for new alerts.

**Q: Can I monitor tickers that don't have filings yet?**
A: Yes! Use the "Add Ticker to Watchlist" field to add any ticker. It will appear in your watchlist and alerts will show when filings are detected.

**Q: What happens if the risk score seems wrong?**
A: Risk scores are calculated automatically and may have false positives/negatives. Always review the actual filing document (linked in details) to verify.

**Q: How do I know if a filing is a real dilution event?**
A: Check the filing type - S-1, S-3, 424B4, 424B5, and EFFECT filings are dilution-related. S-1/A amendments are also relevant. 8-K filings may signal upcoming dilution.

**Q: Can I export the data?**
A: Currently, data is only available through the web interface. Export functionality may be added in future updates.

**Q: Why are some filings missing data (e.g., offering amount)?**
A: Some filings (especially amendments) may not contain full details. The system attempts to lookup original S-1 filings when possible, but some data may still be missing.

**Q: What's the difference between "Warrants Found" and "Has Warrants"?**
A: "Warrants Found" is a broad keyword search, while "Has Warrants" uses structured pattern matching for offering warrants. They may differ in some cases.

**Q: How accurate is the stock price filtering?**
A: Price data comes from Yahoo Finance (unofficial API) and may be delayed or inaccurate. Use as a rough filter, not for precise price information.

---

## Version History

- **v1.0.0** (January 2026)
  - Initial release
  - Real-time SEC filing monitoring
  - Risk scoring system
  - Watchlist functionality
  - Web dashboard with filtering
  - Education resources

---

## License & Attribution

**SEC Data**: Public domain (SEC EDGAR filings are public records)

**Code**: Proprietary

**Third-Party Services**:
- Supabase - Database hosting
- Vercel - Web hosting
- GitHub Actions - Automation

---

**Last Updated**: January 2026  
**Version**: 1.0.0  
**Maintainer**: gdwoods@gmail.com
