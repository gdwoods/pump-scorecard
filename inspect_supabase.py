"""
Inspect Supabase Database: Check record details

This script shows statistics about records in the database to help understand
what data is populated and what needs cleanup.
"""

import os
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
import re


def extract_price_value(price_str):
    """Extract numeric price from string."""
    if not price_str:
        return None
    price_match = re.search(r'([\d\.]+)', str(price_str))
    if price_match:
        try:
            return float(price_match.group(1))
        except ValueError:
            return None
    return None


def inspect_supabase():
    """Inspect database records and show statistics."""
    print("=" * 60)
    print("Supabase Database Inspection")
    print("=" * 60)
    print()
    
    client = init_supabase()
    if not client:
        print("❌ Failed to initialize Supabase client")
        return
    
    # Fetch all records
    print("[Inspect] Fetching all records...")
    response = client.table('sec_filing_alerts').select('*').execute()
    records = response.data
    print(f"[Inspect] Found {len(records)} total records\n")
    
    # Statistics
    stats = {
        'total': len(records),
        'with_share_price': 0,
        'without_share_price': 0,
        'price_over_10': 0,
        'price_under_10': 0,
        'empty_offering_amount': 0,
        'effect_filings': 0,
        'effect_empty': 0,
        'by_form_type': {},
    }
    
    # Sample records by category
    samples = {
        'high_price': [],
        'empty_offering': [],
        'effect_empty': [],
    }
    
    for record in records:
        ticker = record.get('ticker', 'UNKNOWN')
        form_type = record.get('form_type', '')
        share_price_str = record.get('share_price')
        base_offering = record.get('base_offering_amount')
        
        # Count form types
        stats['by_form_type'][form_type] = stats['by_form_type'].get(form_type, 0) + 1
        
        # Share price stats
        if share_price_str:
            stats['with_share_price'] += 1
            price_value = extract_price_value(share_price_str)
            if price_value:
                if price_value >= 10.0:
                    stats['price_over_10'] += 1
                    if len(samples['high_price']) < 10:
                        samples['high_price'].append({
                            'ticker': ticker,
                            'form_type': form_type,
                            'share_price': share_price_str,
                            'price_value': price_value
                        })
                else:
                    stats['price_under_10'] += 1
        else:
            stats['without_share_price'] += 1
        
        # Offering amount stats
        if not base_offering:
            stats['empty_offering_amount'] += 1
            if len(samples['empty_offering']) < 10:
                samples['empty_offering'].append({
                    'ticker': ticker,
                    'form_type': form_type,
                    'share_price': share_price_str or 'N/A'
                })
        
        # EFFECT filing stats
        if form_type.upper() == 'EFFECT':
            stats['effect_filings'] += 1
            if not base_offering:
                stats['effect_empty'] += 1
                if len(samples['effect_empty']) < 10:
                    samples['effect_empty'].append({
                        'ticker': ticker,
                        'share_price': share_price_str or 'N/A'
                    })
    
    # Print statistics
    print("Statistics:")
    print("-" * 60)
    print(f"Total records: {stats['total']}")
    print(f"  - With share_price: {stats['with_share_price']}")
    print(f"  - Without share_price: {stats['without_share_price']}")
    print()
    print(f"Share Price Breakdown:")
    print(f"  - Price >= $10.00: {stats['price_over_10']}")
    print(f"  - Price < $10.00: {stats['price_under_10']}")
    print()
    print(f"Offering Details:")
    print(f"  - Empty base_offering_amount: {stats['empty_offering_amount']}")
    print()
    print(f"EFFECT Filings:")
    print(f"  - Total EFFECT: {stats['effect_filings']}")
    print(f"  - EFFECT with empty offering: {stats['effect_empty']}")
    print()
    print("Form Types:")
    for form_type, count in sorted(stats['by_form_type'].items(), key=lambda x: -x[1]):
        print(f"  - {form_type}: {count}")
    print()
    
    # Print samples
    if samples['high_price']:
        print("Sample records with price >= $10:")
        print("-" * 60)
        for sample in samples['high_price']:
            print(f"  {sample['ticker']} ({sample['form_type']}): ${sample['price_value']:.2f} - '{sample['share_price']}'")
        print()
    
    if samples['empty_offering']:
        print("Sample records with empty offering amount:")
        print("-" * 60)
        for sample in samples['empty_offering'][:10]:
            print(f"  {sample['ticker']} ({sample['form_type']}): share_price = {sample['share_price']}")
        print()
    
    if samples['effect_empty']:
        print("Sample EFFECT filings with empty offering:")
        print("-" * 60)
        for sample in samples['effect_empty'][:10]:
            print(f"  {sample['ticker']}: share_price = {sample['share_price']}")
        print()
    
    print("=" * 60)


if __name__ == "__main__":
    inspect_supabase()
