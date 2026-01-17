"""
One-time scan script to find relevant dilution filings.

This script scans SEC filings for each relevant form type (S-1, S-3, 424B4, 424B5, 8-K)
until it finds at least some relevant filings.
"""

import sys
from typing import List, Dict, Optional
import pandas as pd

from config import RELEVANT_FORM_TYPES
from universe_builder import build_or_load_universe
from filing_scanner import scan_filings_by_form_type, enrich_filings_with_tickers
from analyzer import analyze_filings
from filing_parser import parse_filing_details
from main import save_alerts
from price_filter import filter_filings_by_price


def scan_until_found(min_filings: int = 5, max_per_form: int = 50, max_price: Optional[float] = None, days_back: Optional[int] = None) -> List[Dict]:
    """
    Scans SEC filings for each relevant form type until we find at least min_filings.
    
    Args:
        min_filings: Minimum number of relevant filings to find before stopping
        max_per_form: Maximum filings to fetch per form type
        
    Returns:
        List of relevant filing dictionaries
    """
    print("=" * 60)
    print("Scanning SEC Filings Until Relevant Forms Found")
    print("=" * 60)
    print(f"Target: Find at least {min_filings} relevant filings")
    print(f"Form types: {', '.join(RELEVANT_FORM_TYPES)}")
    print()
    
    # Load universe for ticker lookups
    print("[Scan] Loading company universe...")
    universe_df = build_or_load_universe(force_refresh=False)
    if universe_df is None:
        print("[Scan] ❌ Failed to load universe")
        return []
    print(f"[Scan] ✓ Loaded universe with {len(universe_df)} companies\n")
    
    all_relevant_filings = []
    
    # Scan each form type
    for form_type in RELEVANT_FORM_TYPES:
        print(f"[Scan] Scanning for {form_type} filings...")
        filings = scan_filings_by_form_type(form_type, count=max_per_form, days_back=days_back)
        
        if filings:
            # Enrich with ticker symbols
            enriched = enrich_filings_with_tickers(filings, universe_df)
            all_relevant_filings.extend(enriched)
            print(f"[Scan] ✓ Found {len(enriched)} {form_type} filings (total: {len(all_relevant_filings)})\n")
        else:
            print(f"[Scan] ⚠️  No {form_type} filings found\n")
        
        # Stop if we have enough
        if len(all_relevant_filings) >= min_filings:
            print(f"[Scan] ✓ Found {len(all_relevant_filings)} relevant filings (target: {min_filings})")
            break
    
    if not all_relevant_filings:
        print("[Scan] ⚠️  No relevant filings found in this scan")
        return []
    
    print(f"\n[Scan] Summary: Found {len(all_relevant_filings)} relevant filings")
    print("\nSample filings:")
    for i, filing in enumerate(all_relevant_filings[:10], 1):
        ticker = filing.get("ticker", "UNKNOWN")
        form_type = filing.get("form_type", "UNKNOWN")
        title = filing.get("title", "N/A")[:60]
        print(f"  {i}. {ticker} - {form_type}: {title}")
    
    return all_relevant_filings


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Scan SEC filings until relevant forms are found")
    parser.add_argument("--min-filings", type=int, default=5, help="Minimum filings to find (default: 5)")
    parser.add_argument("--max-per-form", type=int, default=50, help="Max filings per form type (default: 50)")
    parser.add_argument("--parse-details", action="store_true", help="Parse filing details (offering amount, share price, etc.)")
    parser.add_argument("--analyze", action="store_true", help="Analyze filings for red flags")
    parser.add_argument("--save", action="store_true", help="Save results to CSV")
    parser.add_argument("--max-price", type=float, default=None, help="Filter to stocks under this price (e.g., 10.0 for $10)")
    parser.add_argument("--days-back", type=int, default=None, help="Only include filings from last N days (e.g., 30 for last 30 days)")
    
    args = parser.parse_args()
    
    # Scan for filings
    filings = scan_until_found(min_filings=args.min_filings, max_per_form=args.max_per_form, days_back=args.days_back)
    
    if not filings:
        print("\n❌ No relevant filings found")
        sys.exit(1)
    
    # Optionally parse filing details
    # Note: Price filtering is done during parsing (early extraction of share price)
    if args.parse_details or args.analyze:
        print("\n" + "=" * 60)
        print("Parsing Filing Details")
        print("=" * 60)
        
        parsed_filings = []
        for i, filing in enumerate(filings, 1):
            print(f"[Parser] Processing filing {i}/{len(filings)}...")
            details = parse_filing_details(filing, max_price=args.max_price if args.max_price else None)
            
            # Skip if filtered by price
            if details.get("filtered_by_price"):
                continue
            
            # Merge details into filing dict
            filing_with_details = {**filing, **details}
            parsed_filings.append(filing_with_details)
        
        filings = parsed_filings
        if args.max_price:
            print(f"\n[Parser] Filtered to {len(filings)} filings with price < ${args.max_price:.2f}")
        print(f"\n✓ Parsed details for {len(filings)} filings")
        
        # Show summary of parsed details
        filings_with_amount = [f for f in filings if f.get("base_offering_amount")]
        if filings_with_amount:
            print(f"\nFilings with offering amounts:")
            for filing in filings_with_amount[:10]:
                ticker = filing.get("ticker", "UNKNOWN")
                amount = filing.get("base_offering_amount", "N/A")
                price = filing.get("share_price", "N/A")
                underwriters = filing.get("underwriters", [])
                print(f"  - {ticker}: {amount}, Price: {price}, Underwriters: {', '.join(underwriters[:2]) if underwriters else 'None'}")
    
    # Optionally analyze filings
    if args.analyze:
        print("\n" + "=" * 60)
        print("Analyzing Filings for Red Flags")
        print("=" * 60)
        analyzed_filings = analyze_filings(filings)
        
        red_flag_filings = [f for f in analyzed_filings if f.get("has_red_flags", False)]
        print(f"\n✓ Analysis complete: {len(red_flag_filings)} filings with red flags found")
        
        if red_flag_filings:
            print("\nFilings with red flags:")
            for filing in red_flag_filings[:10]:
                ticker = filing.get("ticker", "UNKNOWN")
                form_type = filing.get("form_type", "UNKNOWN")
                risk_score = filing.get("risk_score", 0)
                red_flags = filing.get("red_flags_found", set())
                print(f"  - {ticker} ({form_type}): Risk Score {risk_score}, Flags: {', '.join(list(red_flags)[:3])}")
        
        filings = analyzed_filings
    
    # Optionally save to CSV
    if args.save:
        print("\n" + "=" * 60)
        print("Saving Results to CSV")
        print("=" * 60)
        success = save_alerts(filings)
        if success:
            print("✓ Results saved to dilution_alerts.csv")
        else:
            print("❌ Failed to save results")
    
    print(f"\n✅ Scan complete: {len(filings)} filings processed")
