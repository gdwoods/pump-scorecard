"""
Main Entry Point: SEC EDGAR Dilution Alert Scanner

This script orchestrates the entire dilution detection pipeline:
1. Builds/loads company universe
2. Scans latest SEC filings
3. Analyzes filings for red flags
4. Outputs results to dilution_alerts.csv

Run this script periodically (e.g., via cron) to monitor for new dilution events.
"""

import os
import sys
import csv
from datetime import datetime
from typing import List, Dict
import pandas as pd

from config import DILUTION_ALERTS_CSV_PATH, DATA_DIR
from universe_builder import build_or_load_universe
from filing_scanner import scan_latest_filings, scan_filings_by_form_type
from analyzer import analyze_filings
from filing_parser import parse_filing_details
from supabase_storage import init_supabase, save_alerts_to_db


def save_alerts(filings: List[Dict], filepath: str = DILUTION_ALERTS_CSV_PATH) -> bool:
    """
    Saves dilution alert results to both Supabase (if configured) and CSV.
    
    This function attempts to save to Supabase first, then falls back to CSV
    if Supabase is not configured or fails. This allows for dual-write during
    migration and ensures data is always saved somewhere.
    
    Args:
        filings: List of analyzed filing dictionaries
        filepath: Path where CSV should be saved (fallback)
        
    Returns:
        True if save was successful (to either Supabase or CSV), False otherwise
    """
    # Try Supabase first (if configured)
    client = init_supabase()
    if client:
        try:
            success = save_alerts_to_db(filings, client)
            if success:
                print("[Main] ✓ Saved to Supabase database")
                # Also save to CSV as backup
                save_alerts_to_csv(filings, filepath)
                return True
            else:
                print("[Main] Supabase save failed, falling back to CSV")
        except Exception as e:
            print(f"[Main] Supabase error: {e}, falling back to CSV")
    
    # Fallback to CSV
    return save_alerts_to_csv(filings, filepath)


def save_alerts_to_csv(filings: List[Dict], filepath: str = DILUTION_ALERTS_CSV_PATH) -> bool:
    """
    Saves dilution alert results to a CSV file.
    
    The CSV includes:
    - Date: Filing date
    - Ticker: Company ticker symbol
    - Form_Type: SEC form type (S-1, 8-K, etc.)
    - Link_to_Filing: URL to the filing
    - Warrants_Found: Yes/No
    - Underwriter_Found: Comma-separated list of underwriters found
    - Red_Flags_Found: Comma-separated list of red flag keywords
    - Risk_Score: Calculated risk score
    
    Args:
        filings: List of analyzed filing dictionaries
        filepath: Path where CSV should be saved
        
    Returns:
        True if save was successful, False otherwise
    """
    try:
        # Create data directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Prepare rows for CSV
        rows = []
        for filing in filings:
            # Skip filings with UNKNOWN ticker
            ticker = filing.get("ticker", "UNKNOWN")
            if not ticker or ticker.upper() == "UNKNOWN":
                continue
            
            # Extract date (try multiple field names)
            date_str = filing.get("pubDate") or filing.get("date") or filing.get("filing_date", "")
            # Parse and format date
            try:
                if date_str:
                    # Try to parse various date formats
                    from dateutil import parser
                    date_obj = parser.parse(date_str)
                    date_formatted = date_obj.strftime("%Y-%m-%d")
                else:
                    date_formatted = datetime.now().strftime("%Y-%m-%d")
            except:
                date_formatted = date_str  # Use as-is if parsing fails
            
            # Format red flags and underwriters as comma-separated strings
            red_flags = ", ".join(sorted(filing.get("red_flags_found", set()))) or "None"
            underwriters = ", ".join(sorted(filing.get("underwriters_found", set()))) or "None"
            
            # Determine warrants found status
            warrants_found = "Yes" if filing.get("warrants_found", False) else "No"
            
            # Extract short seller signals
            signals = filing.get("short_seller_signals", {})
            
            row = {
                "Date": date_formatted,
                "Ticker": ticker,
                "Form_Type": filing.get("form_type", "UNKNOWN"),
                "Link_to_Filing": filing.get("link", filing.get("url", "")),
                "Warrants_Found": warrants_found,
                "Underwriter_Found": underwriters,
                "Red_Flags_Found": red_flags,
                "Risk_Score": filing.get("risk_score", 0),
                # Short seller signals
                "Cap_Raise_Amount": signals.get("offering_amount"),
                "Toxic_Debt_Detected": "Yes" if signals.get("high_interest_debt") else "No",
                "Toxic_Debt_Snippet": signals.get("high_interest_debt_snippet"),
                "Management_Turnover": "Yes" if signals.get("resignation_detected") else "No",
                "Resignation_Snippet": signals.get("resignation_snippet"),
                "Warrant_Coverage": signals.get("warrant_coverage"),
            }
            
            # Add parsed filing details if available
            # Base offering amount (renamed from Offering_Amount)
            # Populate both columns for backward compatibility
            # Validate offering amounts before saving (filter out invalid values like "billion" strings)
            if filing.get("base_offering_amount"):
                base_amount = filing.get("base_offering_amount")
                # Additional validation: reject amounts containing "billion" or values > $500M
                if isinstance(base_amount, str):
                    # Check if string contains "billion" (invalid)
                    if 'billion' in base_amount.lower() or 'B' in base_amount.upper():
                        # Skip invalid values
                        pass
                    else:
                        # Try to parse and validate numeric value
                        try:
                            import re
                            clean = base_amount.replace('$', '').replace(',', '').strip()
                            num_val = float(clean)
                            # Only save if within valid range ($10M - $500M)
                            if 10_000_000 <= num_val <= 500_000_000:
                                row["Base_Offering_Amount"] = base_amount
                                row["Offering_Amount"] = base_amount  # Backward compatibility
                        except (ValueError, AttributeError):
                            # If parsing fails, skip it
                            pass
                else:
                    # If it's already a numeric value, validate range
                    try:
                        num_val = float(base_amount) if base_amount else None
                        if num_val and 10_000_000 <= num_val <= 500_000_000:
                            row["Base_Offering_Amount"] = base_amount
                            row["Offering_Amount"] = base_amount  # Backward compatibility
                    except (ValueError, TypeError):
                        pass
            if filing.get("share_price"):
                row["Share_Price"] = filing.get("share_price")
            if filing.get("number_of_shares"):
                row["Number_of_Shares"] = filing.get("number_of_shares")
            
            # Additional dilutions
            if filing.get("additional_dilutions"):
                row["Additional_Dilutions"] = filing.get("additional_dilutions")
            if filing.get("overallotment_shares"):
                row["Overallotment_Shares"] = filing.get("overallotment_shares")
            if filing.get("overallotment_amount"):
                row["Overallotment_Amount"] = filing.get("overallotment_amount")
            if filing.get("has_warrants") is not None:
                row["Has_Warrants"] = "Yes" if filing.get("has_warrants") else "No"
            if filing.get("warrants_per_share"):
                row["Warrants_Per_Share"] = filing.get("warrants_per_share")
            if filing.get("private_placement_shares"):
                row["Private_Placement_Shares"] = filing.get("private_placement_shares")
            if filing.get("private_placement_amount"):
                row["Private_Placement_Amount"] = filing.get("private_placement_amount")
            
            rows.append(row)
        
        # Create DataFrame and save to CSV
        df = pd.DataFrame(rows)
        
        # Append to existing CSV if it exists, otherwise create new
        if os.path.exists(filepath):
            existing_df = pd.read_csv(filepath)
            # Combine and remove duplicates (based on ticker + date + form_type)
            combined_df = pd.concat([existing_df, df], ignore_index=True)
            combined_df = combined_df.drop_duplicates(
                subset=["Ticker", "Date", "Form_Type"],
                keep="last"  # Keep the latest entry if duplicate
            )
            df = combined_df
        
        # Sort by date (most recent first) and risk score (highest first)
        df = df.sort_values(["Date", "Risk_Score"], ascending=[False, False])
        
        # Save to CSV
        df.to_csv(filepath, index=False)
        
        print(f"[Main] Saved {len(df)} alerts to {filepath}")
        return True
        
    except Exception as e:
        print(f"[Main] Error saving alerts to CSV: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_scanner(force_refresh_universe: bool = False, filing_count: int = 100):
    """
    Main function: Runs the complete dilution detection pipeline.
    
    This function:
    1. Builds or loads the company universe
    2. Scans latest SEC filings
    3. Analyzes filings for red flags
    4. Saves results to CSV
    
    Args:
        force_refresh_universe: If True, force refresh of company universe
        filing_count: Number of latest filings to scan
    """
    print("=" * 60)
    print("SEC EDGAR Dilution Alert Scanner")
    print("=" * 60)
    print(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Step 1: Build or load company universe
    print("[Main] Step 1: Loading company universe...")
    universe_df = build_or_load_universe(force_refresh=force_refresh_universe)
    
    if universe_df is None:
        print("[Main] ❌ Failed to load company universe. Cannot continue.")
        return
    
    print(f"[Main] ✓ Loaded universe with {len(universe_df)} companies\n")
    
    # Step 2: Scan latest filings
    # Enhanced: Scan both general feed and by specific form types for better coverage
    print("[Main] Step 2: Scanning latest SEC filings...")
    
    # Strategy 1: Get general feed (covers mixed form types)
    general_filings = scan_latest_filings(universe_df, count=filing_count)
    
    # Strategy 2: Also scan each relevant form type individually (better coverage)
    # This helps catch filings that might be missed by the general feed
    from config import RELEVANT_FORM_TYPES
    form_type_filings = []
    for form_type in RELEVANT_FORM_TYPES:
        print(f"[Main] Scanning {form_type} filings...")
        filings_by_form = scan_filings_by_form_type(form_type, count=50, days_back=3)
        if filings_by_form:
            # Enrich with tickers
            from filing_scanner import enrich_filings_with_tickers
            enriched = enrich_filings_with_tickers(filings_by_form, universe_df)
            form_type_filings.extend(enriched)
    
    # Combine and deduplicate by link (same filing might appear in both)
    all_filings = general_filings.copy()
    existing_links = {f.get("link") for f in general_filings if f.get("link")}
    for filing in form_type_filings:
        if filing.get("link") not in existing_links:
            all_filings.append(filing)
            existing_links.add(filing.get("link"))
    
    filings = all_filings
    
    if not filings:
        print("[Main] ⚠️  No relevant filings found in this scan")
        return
    
    print(f"[Main] ✓ Found {len(filings)} relevant filings\n")
    
    # Step 3: Analyze filings for red flags
    print("[Main] Step 3: Analyzing filings for dilution red flags...")
    analyzed_filings = analyze_filings(filings)
    
    # Filter to only filings with red flags (optional - you can remove this filter)
    red_flag_filings = [f for f in analyzed_filings if f.get("has_red_flags", False)]
    
    print(f"[Main] ✓ Analysis complete: {len(red_flag_filings)} filings with red flags found\n")
    
    # Step 4: Save results (to Supabase if configured, otherwise CSV)
    print("[Main] Step 4: Saving results...")
    # Save all analyzed filings (including those without red flags for completeness)
    # If you only want red flag alerts, change to: save_alerts(red_flag_filings)
    # save_alerts() handles dual-write: tries Supabase first, falls back to CSV
    success = save_alerts(analyzed_filings)
    
    if success:
        print("[Main] ✓ Results saved successfully")
    else:
        print("[Main] ❌ Failed to save results")
    
    # Summary
    print("\n" + "=" * 60)
    print("Scan Summary")
    print("=" * 60)
    print(f"Total filings scanned: {len(filings)}")
    print(f"Filings with red flags: {len(red_flag_filings)}")
    print(f"End time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)


if __name__ == "__main__":
    import argparse
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="SEC EDGAR Dilution Alert Scanner - Monitors SEC filings for dilution events"
    )
    parser.add_argument(
        "--refresh-universe",
        action="store_true",
        help="Force refresh of company universe from SEC (default: use cache)"
    )
    parser.add_argument(
        "--filing-count",
        type=int,
        default=100,
        help="Number of latest filings to scan (default: 100)"
    )
    
    args = parser.parse_args()
    
    # Run the scanner
    run_scanner(
        force_refresh_universe=args.refresh_universe,
        filing_count=args.filing_count
    )