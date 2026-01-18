"""
Cleanup Supabase Database: Remove records with stock prices >= $20

This script removes records from the sec_filing_alerts table where:
1. Current stock price (from Yahoo Finance) is >= $20.00
2. share_price in database exists and is >= $20.00 (secondary check)
3. Optionally: Empty records (no offering details) for EFFECT filings

Usage:
    python cleanup_supabase.py [--dry-run] [--remove-empty-effect] [--max-price 20.0]
"""

import os
import re
import sys
import time
from typing import Optional
from pathlib import Path

# Try to load .env file if it exists
env_file = Path(__file__).parent / '.env'
if env_file.exists():
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

from supabase_storage import init_supabase
from supabase import Client
from price_filter import fetch_current_stock_price


def extract_price_value(price_str: Optional[str]) -> Optional[float]:
    """
    Extracts numeric price value from price string.
    
    Examples:
        "$5.50" -> 5.50
        "5.50" -> 5.50
        "10" -> 10.0
        None -> None
    """
    if not price_str:
        return None
    
    # Extract first numeric value
    price_match = re.search(r'([\d\.]+)', str(price_str))
    if price_match:
        try:
            return float(price_match.group(1))
        except ValueError:
            return None
    return None


def cleanup_supabase(
    max_price: float = 20.0,
    remove_empty_effect: bool = False,
    dry_run: bool = False
) -> None:
    """
    Cleans up Supabase database by removing records with prices >= max_price.
    
    Args:
        max_price: Maximum price threshold (default: 20.0)
        remove_empty_effect: If True, also remove EFFECT filings with no offering details
        dry_run: If True, only report what would be deleted without actually deleting
    """
    print("=" * 60)
    print("Supabase Cleanup Script")
    print("=" * 60)
    print(f"Max price threshold: ${max_price:.2f}")
    print(f"Remove empty EFFECT filings: {remove_empty_effect}")
    print(f"Dry run mode: {dry_run}")
    print("=" * 60)
    print()
    
    # Initialize Supabase client
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        print("Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set")
        sys.exit(1)
    
    # Fetch all records
    print("[Cleanup] Fetching all records from sec_filing_alerts...")
    try:
        response = client.table('sec_filing_alerts').select('*').execute()
        all_records = response.data
        print(f"[Cleanup] Found {len(all_records)} total records")
    except Exception as e:
        print(f"❌ Error fetching records: {e}")
        sys.exit(1)
    
    # Identify records to delete
    records_to_delete = []
    price_issue_count = 0
    empty_effect_count = 0
    current_price_issue_count = 0
    
    print("[Cleanup] Checking current stock prices for all companies...")
    print(f"[Cleanup] This may take a few minutes (fetching prices from Yahoo Finance)...")
    print()
    
    for i, record in enumerate(all_records, 1):
        record_id = record.get('id')
        ticker = record.get('ticker', 'UNKNOWN')
        form_type = record.get('form_type', '')
        share_price_str = record.get('share_price')
        base_offering = record.get('base_offering_amount')
        
        should_delete = False
        reason = []
        price_value = None
        current_price = None
        
        # Check 1: Current stock price (fetch from Yahoo Finance)
        # This is the PRIMARY check - we want to filter based on market price, not filing price
        if ticker and ticker != 'UNKNOWN':
            # Try to get current stock price
            current_price = fetch_current_stock_price(ticker)
            
            if current_price is not None:
                # Additional validation: flag suspiciously high prices for manual review
                # Prices > $1,000 are extremely rare (only a few stocks like BRK.A)
                # If we get a price > $1,000, it's likely a parsing error (market cap, volume, etc.)
                if current_price > 1000:
                    print(f"  ⚠️  WARNING: {ticker} has suspiciously high price: ${current_price:.2f}")
                    print(f"      Skipping deletion (likely parsing error - market cap/volume, not price)")
                    # Don't delete based on suspicious values - might be parsing error
                    # Instead, skip this record (keep it) to avoid false positives
                    current_price = None  # Treat as if we couldn't fetch price
                elif current_price >= max_price:
                    should_delete = True
                    reason.append(f"current stock price ${current_price:.2f} >= ${max_price:.2f}")
                    price_issue_count += 1
                    current_price_issue_count += 1
                    price_value = current_price
                
                # Progress indicator
                if i % 10 == 0:
                    print(f"  Checked {i}/{len(all_records)} records...")
            else:
                # Couldn't fetch price - might be delisted, OTC, or invalid ticker
                # Don't delete based on missing price data
                pass
            
            # Small delay to avoid rate limiting Yahoo Finance
            if i < len(all_records):  # Don't delay after last record
                time.sleep(0.5)  # 500ms delay between requests
        
        # Check 2: Share price from database (secondary check - in case filing had price)
        # This is less reliable since it's the offering price, not market price
        db_price_value = extract_price_value(share_price_str)
        if db_price_value is not None and db_price_value >= max_price:
            if not should_delete:  # Only add reason if not already marked for deletion
                should_delete = True
                reason.append(f"database price ${db_price_value:.2f} >= ${max_price:.2f}")
                price_issue_count += 1
            price_value = price_value or db_price_value
        
        # Check 3: Empty EFFECT filings (optional)
        if remove_empty_effect:
            if form_type.upper() == 'EFFECT' and not base_offering:
                should_delete = True
                reason.append("EFFECT filing with no offering details")
                empty_effect_count += 1
        
        if should_delete:
            records_to_delete.append({
                'id': record_id,
                'ticker': ticker,
                'form_type': form_type,
                'share_price': share_price_str,
                'price_value': price_value,
                'current_price': current_price,
                'reason': ', '.join(reason)
            })
    
    # Report findings
    print()
    print(f"[Cleanup] Records to delete: {len(records_to_delete)}")
    print(f"  - Current stock price >= ${max_price:.2f}: {current_price_issue_count}")
    print(f"  - Database price >= ${max_price:.2f}: {price_issue_count - current_price_issue_count}")
    if remove_empty_effect:
        print(f"  - Empty EFFECT filings: {empty_effect_count}")
    print()
    
    if len(records_to_delete) == 0:
        print("✅ No records need to be deleted. Database is clean!")
        return
    
    # Show sample of records to delete
    print("Sample of records to be deleted:")
    print("-" * 60)
    for record in records_to_delete[:10]:
        print(f"  ID {record['id']}: {record['ticker']} ({record['form_type']}) - {record['reason']}")
    if len(records_to_delete) > 10:
        print(f"  ... and {len(records_to_delete) - 10} more")
    print("-" * 60)
    print()
    
    if dry_run:
        print("🔍 DRY RUN MODE: No records were actually deleted")
        print("Run without --dry-run to perform the cleanup")
        return
    
    # Confirm deletion
    print(f"⚠️  About to delete {len(records_to_delete)} records")
    confirm = input("Type 'yes' to confirm deletion: ")
    if confirm.lower() != 'yes':
        print("❌ Cleanup cancelled")
        return
    
    # Delete records in batches
    print()
    print("[Cleanup] Deleting records...")
    deleted_count = 0
    failed_count = 0
    
    batch_size = 100
    for i in range(0, len(records_to_delete), batch_size):
        batch = records_to_delete[i:i + batch_size]
        record_ids = [r['id'] for r in batch]
        
        try:
            # Delete by ID
            for record_id in record_ids:
                try:
                    client.table('sec_filing_alerts').delete().eq('id', record_id).execute()
                    deleted_count += 1
                except Exception as e:
                    print(f"  ⚠️  Failed to delete ID {record_id}: {e}")
                    failed_count += 1
            
            print(f"  Deleted batch {i // batch_size + 1}/{(len(records_to_delete) + batch_size - 1) // batch_size} ({deleted_count} records)")
        except Exception as e:
            print(f"  ❌ Error deleting batch: {e}")
            failed_count += len(batch)
    
    # Final summary
    print()
    print("=" * 60)
    print("Cleanup Complete")
    print("=" * 60)
    print(f"✅ Successfully deleted: {deleted_count} records")
    if failed_count > 0:
        print(f"❌ Failed to delete: {failed_count} records")
    print()
    
    # Verify cleanup
    try:
        response = client.table('sec_filing_alerts').select('id').execute()
        remaining_count = len(response.data)
        print(f"Remaining records in database: {remaining_count}")
    except Exception as e:
        print(f"⚠️  Could not verify remaining count: {e}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Clean up Supabase database by removing high-price and empty records"
    )
    parser.add_argument(
        "--max-price",
        type=float,
        default=20.0,
        help="Maximum price threshold (default: 20.0)"
    )
    parser.add_argument(
        "--remove-empty-effect",
        action="store_true",
        help="Also remove EFFECT filings with no offering details"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without actually deleting"
    )
    
    args = parser.parse_args()
    
    cleanup_supabase(
        max_price=args.max_price,
        remove_empty_effect=args.remove_empty_effect,
        dry_run=args.dry_run
    )
