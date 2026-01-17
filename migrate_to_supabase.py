"""
Migration Script: CSV to Supabase

This script migrates existing CSV data to Supabase database.
It reads from dilution_alerts.csv and company_universe.csv and imports
them into the Supabase tables.

Usage:
    # Set environment variables first
    export SUPABASE_URL="https://your-project.supabase.co"
    export SUPABASE_KEY="your-anon-key"
    
    # Run migration
    python migrate_to_supabase.py
"""

import os
import sys
import pandas as pd
from typing import List, Dict
from datetime import datetime
from dateutil import parser as date_parser

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import DILUTION_ALERTS_CSV_PATH, UNIVERSE_CSV_PATH
from supabase_storage import init_supabase, save_alerts_to_db, save_company_universe_to_db


def convert_csv_row_to_filing_dict(row: pd.Series) -> Dict:
    """
    Converts a CSV row to a filing dictionary format expected by save_alerts_to_db.
    
    Args:
        row: Pandas Series representing a CSV row
        
    Returns:
        Filing dictionary
    """
    # Parse date
    date_str = str(row.get("Date", ""))
    try:
        date_obj = date_parser.parse(date_str) if date_str else datetime.now()
        date_formatted = date_obj.strftime("%Y-%m-%d")
    except:
        date_formatted = date_str if date_str else datetime.now().strftime("%Y-%m-%d")
    
    # Parse red flags and underwriters
    red_flags_str = str(row.get("Red_Flags_Found", "")) or "None"
    red_flags = set([f.strip() for f in red_flags_str.split(",") if f.strip() and f.strip() != "None"])
    
    underwriters_str = str(row.get("Underwriter_Found", "")) or "None"
    underwriters = set([f.strip() for f in underwriters_str.split(",") if f.strip() and f.strip() != "None"])
    
    # Parse warrants found
    warrants_found_str = str(row.get("Warrants_Found", "No")).strip()
    warrants_found = warrants_found_str.lower() in ("yes", "true", "1")
    
    # Parse short seller signals
    signals = {}
    toxic_debt_str = str(row.get("Toxic_Debt_Detected", "No")).strip()
    if toxic_debt_str.lower() in ("yes", "true", "1"):
        signals["high_interest_debt"] = True
        signals["high_interest_debt_snippet"] = row.get("Toxic_Debt_Snippet")
    else:
        signals["high_interest_debt"] = False
    
    management_turnover_str = str(row.get("Management_Turnover", "No")).strip()
    if management_turnover_str.lower() in ("yes", "true", "1"):
        signals["resignation_detected"] = True
        signals["resignation_snippet"] = row.get("Resignation_Snippet")
    else:
        signals["resignation_detected"] = False
    
    signals["warrant_coverage"] = row.get("Warrant_Coverage")
    
    # Parse offering amount (try Cap_Raise_Amount, then Base_Offering_Amount, then Offering_Amount)
    offering_amount = row.get("Cap_Raise_Amount") or row.get("Base_Offering_Amount") or row.get("Offering_Amount")
    if pd.notna(offering_amount):
        try:
            # Convert string to float if it's a numeric value
            if isinstance(offering_amount, str):
                clean = offering_amount.replace('$', '').replace(',', '').strip()
                signals["offering_amount"] = float(clean) if clean else None
            else:
                signals["offering_amount"] = float(offering_amount) if pd.notna(offering_amount) else None
        except:
            signals["offering_amount"] = None
    else:
        signals["offering_amount"] = None
    
    # Build filing dictionary
    filing = {
        "pubDate": date_formatted,
        "date": date_formatted,
        "ticker": str(row.get("Ticker", "UNKNOWN")),
        "form_type": str(row.get("Form_Type", "UNKNOWN")),
        "link": str(row.get("Link_to_Filing", "")),
        "url": str(row.get("Link_to_Filing", "")),
        "warrants_found": warrants_found,
        "red_flags_found": red_flags,
        "underwriters_found": underwriters,
        "risk_score": int(row.get("Risk_Score", 0)) if pd.notna(row.get("Risk_Score")) else 0,
        "short_seller_signals": signals,
        # Parsed filing details
        "base_offering_amount": row.get("Base_Offering_Amount") or row.get("Offering_Amount"),
        "share_price": row.get("Share_Price"),
        "number_of_shares": row.get("Number_of_Shares"),
        "overallotment_shares": row.get("Overallotment_Shares"),
        "overallotment_amount": row.get("Overallotment_Amount"),
        "has_warrants": True if str(row.get("Has_Warrants", "No")).lower() in ("yes", "true", "1") else False,
        "warrants_per_share": row.get("Warrants_Per_Share"),
        "private_placement_shares": row.get("Private_Placement_Shares"),
        "private_placement_amount": row.get("Private_Placement_Amount"),
        "additional_dilutions": row.get("Additional_Dilutions"),
    }
    
    return filing


def migrate_alerts_csv(client, csv_path: str = DILUTION_ALERTS_CSV_PATH) -> bool:
    """
    Migrates dilution_alerts.csv to Supabase.
    
    Args:
        client: Supabase client
        csv_path: Path to dilution_alerts.csv
        
    Returns:
        True if successful, False otherwise
    """
    if not os.path.exists(csv_path):
        print(f"[Migration] CSV file not found: {csv_path}")
        return False
    
    print(f"[Migration] Reading {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
        print(f"[Migration] Found {len(df)} rows in CSV")
    except Exception as e:
        print(f"[Migration] Error reading CSV: {e}")
        return False
    
    # Convert CSV rows to filing dictionaries
    print("[Migration] Converting CSV rows to filing format...")
    filings = []
    for idx, row in df.iterrows():
        try:
            filing = convert_csv_row_to_filing_dict(row)
            filings.append(filing)
        except Exception as e:
            print(f"[Migration] Warning: Failed to convert row {idx}: {e}")
            continue
    
    print(f"[Migration] Converted {len(filings)} filings")
    
    # Save to Supabase
    print("[Migration] Saving to Supabase...")
    success = save_alerts_to_db(filings, client)
    
    if success:
        print(f"[Migration] ✅ Successfully migrated {len(filings)} alerts to Supabase")
    else:
        print("[Migration] ❌ Failed to save alerts to Supabase")
    
    return success


def migrate_company_universe_csv(client, csv_path: str = UNIVERSE_CSV_PATH) -> bool:
    """
    Migrates company_universe.csv to Supabase.
    
    Args:
        client: Supabase client
        csv_path: Path to company_universe.csv
        
    Returns:
        True if successful, False otherwise
    """
    if not os.path.exists(csv_path):
        print(f"[Migration] CSV file not found: {csv_path}")
        return False
    
    print(f"[Migration] Reading {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
        print(f"[Migration] Found {len(df)} companies in CSV")
    except Exception as e:
        print(f"[Migration] Error reading CSV: {e}")
        return False
    
    # Save to Supabase (this replaces all existing records)
    print("[Migration] Saving company universe to Supabase...")
    success = save_company_universe_to_db(df, client)
    
    if success:
        print(f"[Migration] ✅ Successfully migrated {len(df)} companies to Supabase")
    else:
        print("[Migration] ❌ Failed to save company universe to Supabase")
    
    return success


def main():
    """Main migration function."""
    print("=" * 60)
    print("CSV to Supabase Migration")
    print("=" * 60)
    print()
    
    # Check environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        print("❌ Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set")
        print()
        print("Please set them before running:")
        print('  export SUPABASE_URL="https://your-project.supabase.co"')
        print('  export SUPABASE_KEY="your-anon-key"')
        sys.exit(1)
    
    print(f"Supabase URL: {supabase_url}")
    print(f"Supabase Key: {'*' * 20}...{supabase_key[-4:]}")
    print()
    
    # Initialize Supabase client
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        sys.exit(1)
    
    print()
    print("Starting migration...")
    print("-" * 60)
    
    # Migrate company universe first
    print("\n1. Migrating company_universe.csv...")
    universe_success = migrate_company_universe_csv(client)
    
    # Migrate alerts
    print("\n2. Migrating dilution_alerts.csv...")
    alerts_success = migrate_alerts_csv(client)
    
    # Summary
    print()
    print("=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"Company Universe: {'✅ Success' if universe_success else '❌ Failed'}")
    print(f"Dilution Alerts: {'✅ Success' if alerts_success else '❌ Failed'}")
    
    if universe_success and alerts_success:
        print()
        print("✅ Migration complete! Data is now in Supabase.")
        print("You can now use Supabase instead of CSV files.")
    else:
        print()
        print("⚠️  Migration completed with errors. Check logs above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
