# SEC Scraper Web App

Next.js web application for viewing SEC dilution alerts from Supabase.

## Features

- 📊 **Alert Dashboard**: View all dilution alerts in a sortable table
- 🔍 **Filtering**: Filter by ticker, form type, date range, and risk score
- 🚩 **Red Flag Indicators**: Visual badges for toxic debt, management turnover, warrants, and underwriters
- 🔗 **Direct Links**: Click through to original SEC filings
- 📱 **Responsive**: Works on desktop and mobile

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env.local` in the `web/` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qnbobgnexagjlgzpeigb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

See `VERCEL_SETUP.md` for detailed Vercel deployment instructions.

## Project Structure

- `app/` - Next.js app router (pages and API routes)
- `app/api/alerts/` - API route for querying Supabase
- `components/` - React components
  - `AlertTable.tsx` - Main alerts table
  - `AlertFilters.tsx` - Filter controls
- `lib/` - Utilities
  - `supabase.ts` - Supabase client
  - `utils.ts` - Helper functions
- `types/` - TypeScript type definitions

## Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Database (PostgreSQL)
- **Lucide React** - Icons
