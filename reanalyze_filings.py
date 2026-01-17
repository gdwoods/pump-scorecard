"""
Re-analyze existing filings to update underwriter flags and other signals.

This script re-runs the analyzer on existing filings in Supabase to update
them with improved detection logic (e.g., more accurate underwriter detection).
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env.local if it exists
# Check multiple possible locations
possible_env_files = [
    Path(__file__).parent.parent / '.env.local',  # pump-scorecard/.env.local
    Path(__file__).parent / '.env.local',  # sec_scraper/.env.local
    Path.home() / '.env.local',  # ~/.env.local
]

for env_file in possible_env_files:
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if 'SUPABASE' in key.upper():
                        os.environ[key] = value
                        # Also set SUPABASE_KEY if we have SUPABASE_ANON_KEY
                        if key == 'SUPABASE_ANON_KEY' and not os.getenv('SUPABASE_KEY'):
                            os.environ['SUPABASE_KEY'] = value
        break

# Fallback: Set from known values if not loaded from file
if not os.getenv('SUPABASE_URL'):
    os.environ['SUPABASE_URL'] = 'https://qnbobgnexagjlgzpeigb.supabase.co'
if not os.getenv('SUPABASE_KEY') and not os.getenv('SUPABASE_ANON_KEY'):
    os.environ['SUPABASE_ANON_KEY'] = 'sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_'
    os.environ['SUPABASE_KEY'] = 'sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_'

from supabase_storage import init_supabase, save_alerts_to_db
from analyzer import analyze_filing
from filing_parser import parse_filing_details
import pandas as pd
from config import DILUTION_ALERTS_CSV_PATH


def reanalyze_all_filings():
    """Re-analyze all filings in Supabase and update them with new detection logic."""
    print("=" * 60)
    print("Re-analyzing All Filings")
    print("=" * 60)
    print()
    
    # Initialize Supabase
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        print("   Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set")
        sys.exit(1)
    
    # Load all alerts from Supabase
    print("Step 1: Loading existing alerts from Supabase...")
    try:
        response = client.table('sec_filing_alerts').select('*').order('date', desc=True).execute()
        existing_alerts = response.data if response.data else []
        print(f"   Found {len(existing_alerts)} alerts in database")
    except Exception as e:
        print(f"   ❌ Error loading alerts: {e}")
        sys.exit(1)
    
    if not existing_alerts:
        print("   ⚠️  No alerts found to re-analyze")
        return
    
    print()
    print("Step 2: Re-analyzing filings...")
    print("-" * 60)
    
    updated_filings = []
    failed_count = 0
    
    for idx, alert in enumerate(existing_alerts, 1):
        ticker = alert.get('ticker', 'UNKNOWN')
        form_type = alert.get('form_type', 'UNKNOWN')
        date = alert.get('date', '')
        
        print(f"[{idx}/{len(existing_alerts)}] Re-analyzing {ticker} - {form_type} ({date})...")
        
        # Convert Supabase row back to filing dict format for analysis
        filing = {
            "ticker": ticker,
            "form_type": form_type,
            "pubDate": date,
            "date": date,
            "link": alert.get('link_to_filing', ''),
            "url": alert.get('link_to_filing', ''),
            "cik": alert.get('cik'),  # May not be in alert, that's OK
        }
        
        try:
            # Re-analyze the filing
            analysis_result = analyze_filing(filing)
            
            # Merge analysis results into filing dict
            filing.update({
                "warrants_found": analysis_result.get("warrants_found", False),
                "red_flags_found": analysis_result.get("red_flags_found", set()),
                "underwriters_found": analysis_result.get("underwriters_found", set()),
                "risk_score": analysis_result.get("risk_score", 0),
                "has_red_flags": analysis_result.get("has_red_flags", False),
                "short_seller_signals": analysis_result.get("short_seller_signals", {}),
            })
            
            # Also preserve existing parsed details if they exist
            if alert.get('base_offering_amount'):
                filing['base_offering_amount'] = alert.get('base_offering_amount')
            if alert.get('share_price'):
                filing['share_price'] = alert.get('share_price')
            if alert.get('number_of_shares'):
                filing['number_of_shares'] = alert.get('number_of_shares')
            if alert.get('has_warrants') is not None:
                filing['has_warrants'] = alert.get('has_warrants')
            if alert.get('underwriter_found'):
                # Keep existing if analysis didn't find one (might have been parsed from filing_parser)
                if not filing.get('underwriters_found'):
                    filing['underwriters_found'] = {alert.get('underwriter_found')}
            
            updated_filings.append(filing)
            
            # Show what changed
            old_underwriters = alert.get('underwriter_found', '')
            new_underwriters = ', '.join(sorted(filing.get('underwriters_found', set()))) or 'None'
            if old_underwriters != new_underwriters:
                print(f"   ✓ Underwriter: '{old_underwriters}' → '{new_underwriters}'")
            
        except Exception as e:
            print(f"   ❌ Error analyzing filing: {e}")
            failed_count += 1
            import traceback
            traceback.print_exc()
            continue
    
    print()
    print("Step 3: Saving updated filings to Supabase...")
    print("-" * 60)
    
    if updated_filings:
        success = save_alerts_to_db(updated_filings, client, table_name="sec_filing_alerts")
        if success:
            print(f"✅ Successfully updated {len(updated_filings)} filings")
            if failed_count > 0:
                print(f"⚠️  {failed_count} filings failed to re-analyze")
        else:
            print("❌ Failed to save updated filings")
    else:
        print("⚠️  No filings to update")
    
    print()
    print("=" * 60)
    print("Re-analysis complete!")
    print("=" * 60)


if __name__ == "__main__":
    reanalyze_all_filings()
