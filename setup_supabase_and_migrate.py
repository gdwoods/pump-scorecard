"""
Automated Supabase Setup and CSV Migration

This script:
1. Checks if tables exist
2. Provides SQL if tables need to be created
3. Migrates CSV data once tables are ready

Usage:
    python setup_supabase_and_migrate.py
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

from supabase_storage import init_supabase
from migrate_to_supabase import convert_csv_row_to_filing_dict
from config import DILUTION_ALERTS_CSV_PATH, UNIVERSE_CSV_PATH
import pandas as pd

SQL_SCHEMA = """-- Company Universe Table
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


def main():
    print("=" * 60)
    print("Supabase Setup and CSV Migration")
    print("=" * 60)
    print()
    
    # Initialize client
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    # Check if tables exist
    print("Step 1: Checking tables...")
    print("-" * 60)
    
    company_universe_exists = False
    sec_filing_alerts_exists = False
    
    try:
        client.table('company_universe').select('id').limit(1).execute()
        company_universe_exists = True
        print("✅ company_universe table exists")
    except:
        print("⚠️  company_universe table doesn't exist")
    
    try:
        client.table('sec_filing_alerts').select('id').limit(1).execute()
        sec_filing_alerts_exists = True
        print("✅ sec_filing_alerts table exists")
    except:
        print("⚠️  sec_filing_alerts table doesn't exist")
    
    # If tables don't exist, show SQL
    if not (company_universe_exists and sec_filing_alerts_exists):
        print()
        print("⚠️  Tables need to be created first")
        print()
        print("Please run this SQL in Supabase SQL Editor:")
        print("   https://supabase.com/dashboard/project/qnbobgnexagjlgzpeigb/sql")
        print()
        print("-" * 60)
        print(SQL_SCHEMA)
        print("-" * 60)
        print()
        
        response = input("Have you run the SQL above? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Please run the SQL first, then run this script again.")
            sys.exit(0)
        
        # Re-check tables
        print()
        print("Verifying tables were created...")
        try:
            client.table('company_universe').select('id').limit(1).execute()
            company_universe_exists = True
            print("✅ company_universe verified")
        except Exception as e:
            print(f"❌ company_universe still doesn't exist: {e}")
            sys.exit(1)
        
        try:
            client.table('sec_filing_alerts').select('id').limit(1).execute()
            sec_filing_alerts_exists = True
            print("✅ sec_filing_alerts verified")
        except Exception as e:
            print(f"❌ sec_filing_alerts still doesn't exist: {e}")
            sys.exit(1)
    
    print()
    print("Step 2: Migrating CSV data...")
    print("-" * 60)
    
    # Migrate company universe
    from supabase_storage import save_company_universe_to_db, save_alerts_to_db
    
    print("\n2a. Migrating company_universe.csv...")
    if os.path.exists(UNIVERSE_CSV_PATH):
        try:
            df = pd.read_csv(UNIVERSE_CSV_PATH)
            print(f"   Found {len(df)} companies")
            success = save_company_universe_to_db(df, client)
            if success:
                print(f"   ✅ Migrated {len(df)} companies")
            else:
                print("   ❌ Migration failed")
        except Exception as e:
            print(f"   ❌ Error: {e}")
    else:
        print(f"   ⚠️  File not found: {UNIVERSE_CSV_PATH}")
    
    # Migrate alerts
    print("\n2b. Migrating dilution_alerts.csv...")
    if os.path.exists(DILUTION_ALERTS_CSV_PATH):
        try:
            df = pd.read_csv(DILUTION_ALERTS_CSV_PATH)
            print(f"   Found {len(df)} alerts")
            
            filings = []
            for idx, row in df.iterrows():
                try:
                    filing = convert_csv_row_to_filing_dict(row)
                    filings.append(filing)
                except Exception as e:
                    print(f"   Warning: Failed to convert row {idx}: {e}")
            
            print(f"   Converted {len(filings)} filings")
            success = save_alerts_to_db(filings, client, table_name="sec_filing_alerts")
            
            if success:
                print(f"   ✅ Migrated {len(filings)} alerts")
            else:
                print("   ❌ Migration failed")
        except Exception as e:
            print(f"   ❌ Error: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"   ⚠️  File not found: {DILUTION_ALERTS_CSV_PATH}")
    
    print()
    print("=" * 60)
    print("✅ Setup complete!")
    print("=" * 60)
    print()
    print("The scraper will now use Supabase for storage.")
    print("CSV files will still be created as backup.")


if __name__ == "__main__":
    main()
