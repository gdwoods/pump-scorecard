"""
Universe Builder: SEC Company Ticker Database

This module fetches the official SEC company_tickers.json file and converts it
into a local Pandas DataFrame/CSV for fast lookups. This lookup table allows us
to identify ticker symbols from CIK numbers found in SEC filings.
"""

import json
import os
import time
import pandas as pd
import requests
from typing import Dict, Optional
from config import SEC_HEADERS, COMPANY_TICKERS_URL, UNIVERSE_CSV_PATH, DATA_DIR, MAX_RETRIES, RETRY_DELAY


def fetch_company_tickers() -> Optional[Dict]:
    """
    Fetches the official SEC company_tickers.json file.
    
    This JSON contains a mapping of CIK (Central Index Key) to company information
    including ticker symbol and company title. The SEC updates this file regularly.
    
    Returns:
        Dictionary containing company ticker data, or None if fetch fails
        
    Raises:
        requests.RequestException: If the request fails after retries
    """
    print(f"[Universe Builder] Fetching company tickers from SEC...")
    print(f"[Universe Builder] URL: {COMPANY_TICKERS_URL}")
    
    for attempt in range(MAX_RETRIES):
        try:
            # SEC requires proper User-Agent header
            response = requests.get(
                COMPANY_TICKERS_URL,
                headers=SEC_HEADERS,
                timeout=30
            )
            
            # Check for successful response
            if response.status_code == 200:
                data = response.json()
                print(f"[Universe Builder] Successfully fetched {len(data)} company records")
                return data
            elif response.status_code == 429:
                # Rate limited - wait longer before retry
                wait_time = RETRY_DELAY * (attempt + 1)
                print(f"[Universe Builder] Rate limited. Waiting {wait_time}s before retry {attempt + 1}/{MAX_RETRIES}...")
                time.sleep(wait_time)
            else:
                print(f"[Universe Builder] Unexpected status code: {response.status_code}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    
        except requests.RequestException as e:
            print(f"[Universe Builder] Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
    
    print(f"[Universe Builder] Failed to fetch company tickers after {MAX_RETRIES} attempts")
    return None


def build_universe_dataframe(ticker_data: Dict) -> pd.DataFrame:
    """
    Converts the SEC company_tickers.json structure into a Pandas DataFrame.
    
    The SEC JSON structure is:
    {
        "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
        "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
        ...
    }
    
    We convert this to a DataFrame with columns: CIK, Ticker, Company_Name
    
    Args:
        ticker_data: Dictionary from SEC company_tickers.json
        
    Returns:
        Pandas DataFrame with CIK, Ticker, and Company_Name columns
    """
    print(f"[Universe Builder] Building DataFrame from {len(ticker_data)} records...")
    
    # Extract records from the nested dictionary structure
    records = []
    for key, value in ticker_data.items():
        records.append({
            "CIK": str(value.get("cik_str", "")).zfill(10),  # Zero-pad CIK to 10 digits
            "Ticker": value.get("ticker", "").upper(),
            "Company_Name": value.get("title", ""),
        })
    
    # Create DataFrame
    df = pd.DataFrame(records)
    
    # Sort by CIK for easier lookup
    df = df.sort_values("CIK").reset_index(drop=True)
    
    print(f"[Universe Builder] DataFrame created with {len(df)} companies")
    print(f"[Universe Builder] Sample records:")
    print(df.head())
    
    return df


def save_universe_csv(df: pd.DataFrame, filepath: str = UNIVERSE_CSV_PATH) -> bool:
    """
    Saves the universe DataFrame to a CSV file for persistence.
    
    This allows us to avoid re-downloading the entire universe on every run.
    The CSV can be periodically refreshed to pick up new listings/delistings.
    
    Args:
        df: Pandas DataFrame containing company universe data
        filepath: Path where CSV should be saved
        
    Returns:
        True if save was successful, False otherwise
    """
    try:
        # Create data directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Save to CSV
        df.to_csv(filepath, index=False)
        print(f"[Universe Builder] Universe saved to {filepath}")
        return True
        
    except Exception as e:
        print(f"[Universe Builder] Error saving universe CSV: {e}")
        return False


def load_universe_csv(filepath: str = UNIVERSE_CSV_PATH) -> Optional[pd.DataFrame]:
    """
    Loads the company universe from a previously saved CSV file.
    
    Args:
        filepath: Path to the CSV file
        
    Returns:
        Pandas DataFrame with company universe data, or None if file doesn't exist
    """
    if not os.path.exists(filepath):
        print(f"[Universe Builder] Universe CSV not found at {filepath}")
        return None
    
    try:
        df = pd.read_csv(filepath)
        print(f"[Universe Builder] Loaded universe from {filepath} ({len(df)} companies)")
        return df
    except Exception as e:
        print(f"[Universe Builder] Error loading universe CSV: {e}")
        return None


def get_ticker_from_cik(cik: str, universe_df: pd.DataFrame) -> Optional[str]:
    """
    Looks up a ticker symbol from a CIK number using the universe DataFrame.
    
    CIK numbers in SEC filings may be zero-padded or not. We normalize by:
    1. Converting to integer (removing leading zeros) for comparison
    2. Searching for match in the universe DataFrame (which stores CIKs as integers)
    
    Args:
        cik: CIK number (as string or integer)
        universe_df: DataFrame containing CIK -> Ticker mappings
        
    Returns:
        Ticker symbol (uppercase) if found, None otherwise
    """
    if universe_df is None or len(universe_df) == 0:
        return None
    
    # Normalize CIK: convert to integer (removes leading zeros)
    # Handle both string and integer inputs
    try:
        cik_int = int(str(cik).lstrip('0') or '0')  # Convert to int, handling zero-padded strings
    except (ValueError, TypeError):
        return None
    
    # Lookup in DataFrame - CIK column may be stored as int or string
    # Try both integer and string comparison
    matches = universe_df[universe_df["CIK"].astype(str).str.lstrip('0').astype(int) == cik_int]
    
    if len(matches) == 0:
        # Fallback: try direct integer comparison if CIK column is numeric
        if pd.api.types.is_numeric_dtype(universe_df["CIK"]):
            matches = universe_df[universe_df["CIK"] == cik_int]
    
    if len(matches) > 0:
        # Return first match (should be unique, but take first if multiple)
        ticker = matches.iloc[0]["Ticker"]
        return ticker
    
    return None


def build_or_load_universe(force_refresh: bool = False) -> Optional[pd.DataFrame]:
    """
    Main function: Builds a fresh universe or loads from cache.
    
    This is the primary entry point for getting the company universe.
    It will:
    1. Try to load from CSV cache (unless force_refresh=True)
    2. If cache doesn't exist or force_refresh=True, fetch from SEC
    3. Save the fetched data to CSV for future use
    
    Args:
        force_refresh: If True, always fetch fresh data from SEC
        
    Returns:
        Pandas DataFrame with company universe, or None if all operations fail
    """
    # Try to load from cache first (unless forcing refresh)
    if not force_refresh:
        cached_df = load_universe_csv()
        if cached_df is not None:
            return cached_df
    
    # Fetch fresh data from SEC
    ticker_data = fetch_company_tickers()
    if ticker_data is None:
        # If fetch fails but we have cache, use cache as fallback
        print(f"[Universe Builder] Fetch failed, attempting to use cached universe...")
        cached_df = load_universe_csv()
        return cached_df
    
    # Convert to DataFrame
    df = build_universe_dataframe(ticker_data)
    
    # Save to CSV
    save_universe_csv(df)
    
    return df


if __name__ == "__main__":
    # Test the universe builder
    print("=" * 60)
    print("SEC Universe Builder - Test Run")
    print("=" * 60)
    
    df = build_or_load_universe(force_refresh=False)
    
    if df is not None:
        print(f"\n✅ Universe builder test successful!")
        print(f"   Total companies: {len(df)}")
        print(f"   Columns: {list(df.columns)}")
        
        # Test lookup
        test_cik = "0000320193"  # Apple
        test_ticker = get_ticker_from_cik(test_cik, df)
        print(f"\n   Test lookup - CIK {test_cik} -> Ticker: {test_ticker}")
    else:
        print("\n❌ Universe builder test failed!")