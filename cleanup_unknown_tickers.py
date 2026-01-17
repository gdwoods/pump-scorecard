"""
Clean up UNKNOWN ticker records from Supabase.

This script deletes all records from sec_filing_alerts where ticker = 'UNKNOWN'.
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env.local if it exists
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
                        if key == 'SUPABASE_ANON_KEY' and not os.getenv('SUPABASE_KEY'):
                            os.environ['SUPABASE_KEY'] = value
        break

# Fallback: Set from known values if not loaded from file
if not os.getenv('SUPABASE_URL'):
    os.environ['SUPABASE_URL'] = 'https://qnbobgnexagjlgzpeigb.supabase.co'
if not os.getenv('SUPABASE_KEY') and not os.getenv('SUPABASE_ANON_KEY'):
    os.environ['SUPABASE_ANON_KEY'] = 'sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_'
    os.environ['SUPABASE_KEY'] = 'sb_publishable_kWdtDptUsBp6yDrSZsuRLA_kcnXGbz_'

from supabase_storage import init_supabase


def cleanup_unknown_tickers():
    """Delete all records with UNKNOWN ticker from Supabase."""
    print("=" * 60)
    print("Cleanup: Removing UNKNOWN Ticker Records")
    print("=" * 60)
    print()
    
    # Initialize Supabase
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    # Count UNKNOWN records first
    print("Step 1: Counting UNKNOWN ticker records...")
    try:
        response = client.table('sec_filing_alerts').select('id', count='exact').eq('ticker', 'UNKNOWN').execute()
        count = getattr(response, 'count', len(response.data) if hasattr(response, 'data') else 0)
        print(f"   Found {count} records with UNKNOWN ticker")
    except Exception as e:
        print(f"   ⚠️  Error counting records: {e}")
        count = 0
    
    if count == 0:
        print("   ✅ No UNKNOWN ticker records to delete")
        return
    
    # Confirm deletion
    print()
    print(f"⚠️  About to delete {count} records with UNKNOWN ticker")
    response = input("Continue? (yes/no): ").strip().lower()
    
    if response != 'yes':
        print("   Cancelled")
        return
    
    # Delete UNKNOWN records
    print()
    print("Step 2: Deleting UNKNOWN ticker records...")
    try:
        response = client.table('sec_filing_alerts').delete().eq('ticker', 'UNKNOWN').execute()
        deleted_count = len(response.data) if response.data else 0
        print(f"   ✅ Deleted {deleted_count} records")
    except Exception as e:
        print(f"   ❌ Error deleting records: {e}")
        import traceback
        traceback.print_exc()
    
    print()
    print("=" * 60)
    print("Cleanup complete!")
    print("=" * 60)


if __name__ == "__main__":
    cleanup_unknown_tickers()
