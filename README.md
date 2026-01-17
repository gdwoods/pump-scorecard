# SEC EDGAR Dilution Scraper

A Python-based SEC EDGAR scraper for detecting dilution events and short seller signals, with a Next.js web interface for viewing alerts.

## 📁 Project Structure

```
sec_scraper/
├── web/                    # Next.js web application
│   ├── app/               # Next.js app router
│   ├── components/        # React components
│   ├── lib/               # Utilities (Supabase client)
│   └── types/             # TypeScript types
├── data/                  # CSV data files (local backup)
├── *.py                   # Python scraper scripts
└── requirements.txt       # Python dependencies
```

## 🐍 Python Scraper

The Python scraper automatically scans SEC filings for:
- **Dilution Events**: S-1, S-3, 424B4, 424B5, 8-K filings
- **Short Seller Signals**:
  - Toxic debt (high interest rates ≥12%)
  - Management turnover (executive resignations)
  - Warrant coverage
  - Offering amounts

### Setup Python Scraper

```bash
cd /Users/garthwoods/projects/sec_scraper
pip install -r requirements.txt
```

### Run Scanner

```bash
python scan_until_found.py --min-filings 5 --parse-details --analyze --save
```

Results are saved to Supabase (and CSV as backup).

## 🌐 Web Application

The Next.js web app provides a dashboard for viewing dilution alerts from Supabase.

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
- `sec_filing_alerts` - Filing analysis results

See `create_supabase_tables.sql` for schema.

## 🚀 Deployment

- **Python Scraper**: Run on cron or server
- **Web App**: Deployed on Vercel (see `web/VERCEL_SETUP.md`)

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

- `web/README.md` - Web app documentation
- `web/VERCEL_SETUP.md` - Deployment guide
- `create_supabase_tables.sql` - Database schema
