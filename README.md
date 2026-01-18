# SEC EDGAR Dilution Scraper

A comprehensive Python-based SEC EDGAR scraper for detecting dilution events and short seller signals, with a modern Next.js web interface for viewing alerts, analytics, and company profiles.

## 📁 Project Structure

```
sec_scraper/
├── web/                    # Next.js web application
│   ├── app/               # Next.js app router
│   │   ├── page.tsx       # Main alerts dashboard
│   │   ├── company/       # Company profile pages
│   │   ├── underwriters/  # Underwriter analytics
│   │   ├── analytics/     # Charts and visualizations
│   │   ├── education/     # Filing education page
│   │   └── api/          # API routes
│   ├── components/        # React components
│   │   ├── charts/       # Chart components (Recharts)
│   │   └── ...          # UI components
│   ├── hooks/            # React hooks (Realtime)
│   ├── lib/              # Utilities (Supabase, watchlist)
│   └── types/            # TypeScript types
├── data/                  # CSV data files (local backup)
├── *.py                  # Python scraper scripts
├── *.sql                 # Database schema files
└── requirements.txt      # Python dependencies
```

## 🐍 Python Scraper

The Python scraper automatically scans SEC filings for:
- **Dilution Events**: S-1, S-3, 424B4, 424B5, 8-K, EFFECT filings
- **Short Seller Signals**:
  - Toxic debt (high interest rates ≥12%)
  - Management turnover (executive resignations)
  - Warrant coverage
  - Offering amounts
- **Price Tracking**: Captures stock price at filing time and 7 days later to track dilution impact
- **Toxic Underwriters**: Detects high-risk investment banks (Maxim, Wainwright, Aegis, etc.)

### Setup Python Scraper

```bash
cd /Users/garthwoods/projects/sec_scraper
pip install -r requirements.txt
```

### Run Scanner

```bash
python main.py --filing-count 50 --max-price 20.0
```

Results are saved to Supabase (and CSV as backup).

## 🌐 Web Application

The Next.js web app provides a comprehensive dashboard with multiple views:

### Main Features

- **Alerts Dashboard**: Real-time filing alerts with filtering, sorting, and search
- **Company Profiles**: Detailed pages for each ticker showing filing history, statistics, and timeline
- **Underwriter Analytics**: Statistics on the most active underwriters in dilution events
- **Analytics & Charts**: Visual insights including risk score distribution, offering trends, and filing timelines
- **Education Page**: Comprehensive guide to SEC filing types and their implications
- **Price Tracking**: Stock price at filing time and 7 days later with percentage change
- **Watchlists**: Personal ticker watchlists with anonymous user tracking
- **Sound Alerts**: Configurable audible notifications for new filings
- **Realtime Updates**: Supabase Realtime for instant updates (falls back to polling)
- **Dark/Light Mode**: Theme toggle with persistent preferences

### Setup Web App

```bash
cd web
npm install
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
npm run dev
```

See `web/VERCEL_SETUP.md` for deployment instructions.

## 🗄️ Database

Uses Supabase PostgreSQL for storage:
- `company_universe` - CIK to ticker mappings
- `sec_filing_alerts` - Filing analysis results with price tracking
- `user_watchlists` - User-specific ticker watchlists (anonymous UUID-based)

See `create_supabase_tables.sql` and `add_price_tracking_columns.sql` for schema.

## 🚀 Deployment

- **Python Scraper**: Automated via GitHub Actions (every 1-15 minutes)
- **Web App**: Deployed on Vercel (auto-deploys from GitHub)

## 📝 Environment Variables

### Python Scraper
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Web App
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 📚 Documentation

- `DOCUMENTATION.md` - User-facing documentation with feature explanations
- `TECHNICAL_DOCUMENTATION.md` - Comprehensive technical reference
- `SETUP_GUIDE.md` - Setup and deployment instructions
- `web/README.md` - Web app specific documentation
- `web/VERCEL_SETUP.md` - Vercel deployment guide
- `web/REALTIME_SETUP.md` - Supabase Realtime configuration

## 🎯 Key Features

### Real-Time Monitoring
- Automated scanning every 1-15 minutes (market hours vs off-hours)
- Supabase Realtime for instant updates
- Client-side polling as fallback

### Risk Scoring
- Weighted scoring system (0-20+)
- Detects toxic debt, management turnover, warrants, underwriters
- Color-coded risk levels

### Price Tracking
- Captures price at filing time
- Automatically updates 7-day price for older filings
- Color-coded percentage changes in table

### Analytics
- Risk score distribution charts
- Offering amount trends over time
- Filing timeline visualization

### Company Profiles
- Complete filing history per ticker
- Statistics (total filings, risk scores, offering amounts)
- Chronological filing sequence timeline

### Underwriter Analytics
- Statistics on most active underwriters
- Average risk scores per underwriter
- Total offering amounts and company counts

## 📊 Pages & Routes

- `/` - Main alerts dashboard
- `/company/[ticker]` - Company profile page
- `/underwriters` - Underwriter analytics
- `/analytics` - Charts and visualizations
- `/education` - SEC filing education

## 🔧 API Routes

- `/api/alerts` - Fetch dilution alerts (with filters)
- `/api/company/[ticker]` - Company statistics and filing sequence
- `/api/underwriters` - Underwriter statistics
- `/api/analytics` - Chart data (risk distribution, offering trends, filing timeline)
- `/api/check-price` - Stock price checking for watchlist validation

## 📦 Dependencies

### Python
- `requests` - HTTP client
- `pandas` - Data manipulation
- `beautifulsoup4` - HTML parsing
- `supabase` - Database client
- `yfinance` - Stock price fetching
- `python-dateutil` - Date parsing

### Next.js
- `next` - React framework
- `react` - UI library
- `typescript` - Type safety
- `tailwindcss` - CSS framework
- `@supabase/supabase-js` - Database client
- `recharts` - Chart library
- `lucide-react` - Icons

## 🎨 UI Features

- Responsive design (mobile-friendly)
- Dark/light mode with persistent theme
- Real-time updates with connection status
- Sound alerts with multiple sound options
- Watchlist management with star icons
- Form type tooltips
- "New Today" badges
- Color-coded risk scores and price changes

## 📈 Version History

- **v1.1.0** (January 2026)
  - Added price tracking (at filing time and 7 days later)
  - Added company profile pages
  - Added underwriter analytics
  - Added analytics/charts page
  - Added Supabase Realtime integration
  - Enhanced UI with dark mode, sound alerts, watchlists

- **v1.0.0** (January 2026)
  - Initial release
  - Real-time SEC filing monitoring
  - Risk scoring system
  - Web dashboard with filtering

---

**Last Updated**: January 2026  
**Version**: 1.1.0  
**Maintainer**: gdwoods@gmail.com
