# Automation Setup Guide

## Overview

To automatically update Supabase with new SEC filings, you need to run the Python scanner on a schedule. Here are your options:

## Option 1: GitHub Actions (Recommended - Free)

✅ **Pros:**
- Free for public/private repos
- Easy to set up
- Runs on GitHub's infrastructure
- Can schedule multiple times per day
- Manual trigger available

❌ **Cons:**
- Requires GitHub repo to be public or have GitHub Actions enabled
- 30-minute execution limit (should be enough)

### Setup Steps:

1. **Add Secrets to GitHub:**
   - Go to your repo: `https://github.com/gdwoods/ShortSEC`
   - Settings → Secrets and variables → Actions → New repository secret
   - Add:
     ```
     SUPABASE_URL = https://qnbobgnexagjlgzpeigb.supabase.co
     SUPABASE_ANON_KEY = sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_
     ```

2. **Workflow is already configured:**
   - File: `.github/workflows/scan-sec-filings.yml`
   - Runs every 15 minutes during market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)
   - After pushing to GitHub, it will run automatically

3. **Test it:**
   - Push the workflow file to GitHub
   - Go to Actions tab → "Scan SEC Filings" → "Run workflow" (manual test)

---

## Option 2: Vercel Cron Jobs (Alternative)

Vercel supports cron jobs, but execution time limits make it less ideal for Python scripts.

---

## Option 3: Cloud Server with Cron (Advanced)

If you have a server (AWS, DigitalOcean, etc.), you can set up a cron job:

```bash
# Edit crontab
crontab -e

# Add this line (runs every 15 minutes during market hours)
*/15 14-21 * * 1-5 cd /path/to/sec_scraper && /usr/bin/python3 main.py --filing-count 50

# Or use the scan_until_found script
*/15 14-21 * * 1-5 cd /path/to/sec_scraper && /usr/bin/python3 scan_until_found.py --min-filings 5 --parse-details --analyze --save
```

---

## Option 4: Next.js API Route + External Service (Hybrid)

Create a Next.js API route that triggers an external service (like Render, Railway) to run the Python scanner. More complex but gives more control.

---

## Current Workflow

Once automated:
1. **GitHub Actions** (or cron) runs Python scanner every 15 minutes
2. **Scanner** finds new SEC filings, analyzes them, saves to **Supabase**
3. **Web app** polls Supabase every 15 seconds (with random variance)
4. **New filings** appear on the web app automatically

## Recommended: GitHub Actions

The GitHub Actions workflow is already configured in `.github/workflows/scan-sec-filings.yml`. Just:
1. Add the secrets to GitHub
2. Push the workflow file
3. It will start running automatically!
