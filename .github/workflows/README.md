# GitHub Actions Workflows

## SEC Filings Scanner

The `scan-sec-filings.yml` workflow automatically scans SEC filings and updates Supabase.

### Setup

1. **Add Secrets to GitHub Repository:**
   - Go to: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
   - Add:
     - `SUPABASE_URL`: `https://qnbobgnexagjlgzpeigb.supabase.co`
     - `SUPABASE_ANON_KEY`: `sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_`

2. **Schedule:**
   - Runs every 15 minutes during market hours (Mon-Fri, 9:30 AM - 4:00 PM ET)
   - Can also be triggered manually from GitHub Actions UI

3. **What it does:**
   - Scans latest SEC filings for dilution events
   - Analyzes filings for red flags
   - Saves results to Supabase
   - Web app automatically picks up new data via polling

### Manual Trigger

You can manually trigger the workflow from:
- GitHub → Actions tab → "Scan SEC Filings" → "Run workflow"

### Monitoring

- Check workflow runs in GitHub → Actions tab
- View logs to see how many filings were found and saved
- Failed runs will show in Actions with error messages
