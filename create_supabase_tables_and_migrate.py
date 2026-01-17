"""
Create Supabase Tables and Migrate CSV Data

This script:
1. Provides SQL to create tables (run in Supabase SQL Editor)
2. Migrates CSV data to Supabase after tables are created

Usage:
    python create_supabase_tables_and_migrate.py
"""

import os
import sys
from pathlib import Path

# Load environment variables from .env.local
env_file = Path(__file__).parent.parent / '.env.local'
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

from supabase_storage import init_supabase, save_alerts_to_db, save_company_universe_to_db
from migrate_to_supabase import migrate_alerts_csv, migrate_company_universe_csv, convert_csv_row_to_filing_dict
import pandas as pd
from config import DILUTION_ALERTS_CSV_PATH, UNIVERSE_CSV_PATH


SQL_SCHEMA = """
-- Company Universe Table
CREATE TABLE IF NOT EXISTS company_universe (
    id BIGSERIAL PRIMARY KEY,
    cik TEXT NOT NULL UNIQUE,
    ticker TEXT,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_universe_cik ON company_universe(cik);
CREATE INDEX IF NOT EXISTS idx_company_universe_ticker ON company_universe(ticker);

-- SEC Filing Alerts Table
CREATE TABLE IF NOT EXISTS sec_filing_alerts (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    ticker TEXT NOT NULL,
    form_type TEXT NOT NULL,
    link_to_filing TEXT,
    warrants_found BOOLEAN DEFAULT FALSE,
    underwriter_found TEXT,
    red_flags_found TEXT,
    risk_score INTEGER DEFAULT 0,
    cap_raise_amount NUMERIC,
    toxic_debt_detected BOOLEAN DEFAULT FALSE,
    toxic_debt_snippet TEXT,
    management_turnover BOOLEAN DEFAULT FALSE,
    resignation_snippet TEXT,
    warrant_coverage TEXT,
    base_offering_amount TEXT,
    offering_amount TEXT,
    share_price TEXT,
    number_of_shares TEXT,
    overallotment_shares TEXT,
    overallotment_amount TEXT,
    has_warrants BOOLEAN,
    warrants_per_share TEXT,
    private_placement_shares TEXT,
    private_placement_amount TEXT,
    additional_dilutions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ticker, date, form_type)
);

CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_date ON sec_filing_alerts(date DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_ticker ON sec_filing_alerts(ticker);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_risk_score ON sec_filing_alerts(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_form_type ON sec_filing_alerts(form_type);
"""


def create_tables_via_rest_api(client, sql: str) -> bool:
    """
    Attempts to create tables via Supabase REST API.
    
    Note: This typically requires service_role key, not anon key.
    Falls back to manual SQL execution if this doesn't work.
    """
    try:
        # Try to use RPC function or REST API
        # Most Supabase instances don't allow raw SQL via anon key for security
        
        # For now, return False to indicate we need manual SQL execution
        return False
        
    except Exception as e:
        print(f"   Error: {e}")
        return False


def main():
    """Main function to create tables and migrate data."""
    print("=" * 60)
    print("Create Supabase Tables and Migrate CSV Data")
    print("=" * 60)
    print()
    
    # Check environment variables
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set")
        sys.exit(1)
    
    # Initialize Supabase client
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    print("Step 1: Creating tables...")
    print("-" * 60)
    
    # Check if tables already exist
    tables_exist = {
        'company_universe': False,
        'sec_filing_alerts': False,
    }
    
    try:
        client.table('company_universe').select('id').limit(1).execute()
        tables_exist['company_universe'] = True
        print("✅ company_universe table already exists")
    except:
        print("⚠️  company_universe table doesn't exist")
    
    try:
        client.table('sec_filing_alerts').select('id').limit(1).execute()
        tables_exist['sec_filing_alerts'] = True
        print("✅ sec_filing_alerts table already exists")
    except:
        print("⚠️  sec_filing_alerts table doesn't exist")
    
    # If tables don't exist, show SQL
    if not all(tables_exist.values()):
        print()
        print("⚠️  Some tables don't exist. Please run this SQL in Supabase SQL Editor:")
        print()
        print("SQL Editor: https://supabase.com/dashboard → Your Project → SQL Editor")
        print()
        print("-" * 60)
        print(SQL_SCHEMA)
        print("-" * 60)
        print()
        
        response = input("Have you run the SQL above? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Please run the SQL first, then run this script again.")
            sys.exit(0)
        
        # Verify tables were created
        print()
        print("Verifying tables were created...")
        try:
            client.table('company_universe').select('id').limit(1).execute()
            tables_exist['company_universe'] = True
            print("✅ company_universe table verified")
        except Exception as e:
            print(f"❌ company_universe table still doesn't exist: {e}")
            sys.exit(1)
        
        try:
            client.table('sec_filing_alerts').select('id').limit(1).execute()
            tables_exist['sec_filing_alerts'] = True
            print("✅ sec_filing_alerts table verified")
        except Exception as e:
            print(f"❌ sec_filing_alerts table still doesn't exist: {e}")
            sys.exit(1)
    
    print()
    print("Step 2: Migrating CSV data...")
    print("-" * 60)
    
    # Migrate company universe
    print("\n2a. Migrating company_universe.csv...")
    universe_success = migrate_company_universe_csv(client, UNIVERSE_CSV_PATH)
    
    # Migrate alerts (need to update migrate_alerts_csv to use sec_filing_alerts)
    print("\n2b. Migrating dilution_alerts.csv...")
    
    # Custom migration for sec_filing_alerts table
    if os.path.exists(DILUTION_ALERTS_CSV_PATH):
        print(f"Reading {DILUTION_ALERTS_CSV_PATH}...")
        try:
            df = pd.read_csv(DILUTION_ALERTS_CSV_PATH)
            print(f"Found {len(df)} rows in CSV")
            
            # Convert CSV rows to filing dictionaries
            filings = []
            for idx, row in df.iterrows():
                try:
                    filing = convert_csv_row_to_filing_dict(row)
                    filings.append(filing)
                except Exception as e:
                    print(f"Warning: Failed to convert row {idx}: {e}")
                    continue
            
            print(f"Converted {len(filings)} filings")
            print("Saving to sec_filing_alerts table...")
            
            # Use save_alerts_to_db with table_name parameter
            alerts_success = save_alerts_to_db(filings, client, table_name="sec_filing_alerts")
            
            if alerts_success:
                print(f"✅ Successfully migrated {len(filings)} alerts to sec_filing_alerts")
            else:
                print("❌ Failed to save alerts to Supabase")
                alerts_success = False
        except Exception as e:
            print(f"❌ Error migrating alerts: {e}")
            import traceback
            traceback.print_exc()
            alerts_success = False
    else:
        print(f"⚠️  CSV file not found: {DILUTION_ALERTS_CSV_PATH}")
        alerts_success = False
    
    # Summary
    print()
    print("=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"Company Universe: {'✅ Success' if universe_success else '❌ Failed'}")
    print(f"SEC Filing Alerts: {'✅ Success' if alerts_success else '❌ Failed'}")
    
    if universe_success and alerts_success:
        print()
        print("✅ Migration complete! Data is now in Supabase.")
        print("   The scraper will now use Supabase instead of CSV files.")
    else:
        print()
        print("⚠️  Migration completed with errors. Check logs above.")
    
    # Show record counts
    print()
    print("Verifying data...")
    print("-" * 60)
    
    try:
        result = client.table('company_universe').select('id', count='exact').limit(1).execute()
        count = getattr(result, 'count', 'unknown')
        print(f"company_universe: {count} records")
    except:
        print("company_universe: Could not get count")
    
    try:
        result = client.table('sec_filing_alerts').select('id', count='exact').limit(1).execute()
        count = getattr(result, 'count', 'unknown')
        print(f"sec_filing_alerts: {count} records")
    except:
        print("sec_filing_alerts: Could not get count")


if __name__ == "__main__":
    main()
