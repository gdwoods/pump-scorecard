"""
Supabase Storage: Database integration for SEC EDGAR scraper

This module provides database operations using Supabase (PostgreSQL) instead of CSV files.
It maintains the same interface as the CSV-based storage for easy migration.

Tables:
1. company_universe - CIK to ticker mappings
2. dilution_alerts - Filing scan results and analysis

Usage:
    # Initialize Supabase client
    from supabase_storage import init_supabase, save_alerts_to_db
    
    client = init_supabase()
    save_alerts_to_db(filings, client)
"""

import os
import math
import pandas as pd
from typing import List, Dict, Optional
from datetime import datetime
from supabase import create_client, Client
import pandas as pd

# Supabase configuration - set via environment variables
# Supports both SUPABASE_KEY and SUPABASE_ANON_KEY (common naming conventions)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")


def init_supabase() -> Optional[Client]:
    """
    Initialize Supabase client.
    
    Requires SUPABASE_URL and SUPABASE_KEY environment variables.
    
    Returns:
        Supabase client instance, or None if configuration is missing
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[Supabase] Warning: SUPABASE_URL or SUPABASE_KEY not set")
        print("[Supabase] Falling back to CSV storage")
        return None
    
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Supabase] Successfully initialized Supabase client")
        return supabase
    except Exception as e:
        print(f"[Supabase] Error initializing client: {e}")
        return None


def save_company_universe_to_db(universe_df: pd.DataFrame, client: Client) -> bool:
    """
    Saves company universe (CIK-ticker mappings) to Supabase.
    
    Replaces all existing records with the latest data from SEC.
    
    Args:
        universe_df: DataFrame with CIK, Ticker, Company Name columns
        client: Supabase client
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Map CSV columns to database columns (CSV uses CIK, Ticker, Company_Name)
        # Database uses cik, ticker, title (lowercase)
        df_mapped = universe_df.copy()
        
        # Remove duplicates first (keep first occurrence)
        df_mapped = df_mapped.drop_duplicates(subset=['CIK' if 'CIK' in df_mapped.columns else 'cik'], keep='first')
        
        # Rename columns to match database schema
        column_mapping = {
            'CIK': 'cik',
            'Ticker': 'ticker',
            'Company_Name': 'title',
            'cik': 'cik',  # In case already lowercase
            'ticker': 'ticker',
            'title': 'title',
        }
        
        # Rename columns that exist
        df_mapped.rename(columns={k: v for k, v in column_mapping.items() if k in df_mapped.columns}, inplace=True)
        
        # Convert DataFrame to list of dictionaries
        records = df_mapped.to_dict('records')
        
        # Clean NaN values from records (convert to None for JSON compatibility)
        cleaned_records = []
        for record in records:
            cleaned_record = {}
            for key, value in record.items():
                # Check if value is NaN (float or pandas NaN)
                if isinstance(value, float) and math.isnan(value):
                    cleaned_record[key] = None
                elif pd.isna(value):
                    cleaned_record[key] = None
                else:
                    cleaned_record[key] = value
            cleaned_records.append(cleaned_record)
        
        # Upsert records in batches (insert or update on conflict)
        # Using cik as unique key
        batch_size = 1000
        for i in range(0, len(cleaned_records), batch_size):
            batch = cleaned_records[i:i + batch_size]
            # Use upsert with conflict on 'cik' to handle duplicates
            client.table('company_universe').upsert(batch, on_conflict='cik').execute()
        
        print(f"[Supabase] Saved {len(records)} company records to database")
        return True
        
    except Exception as e:
        print(f"[Supabase] Error saving company universe: {e}")
        return False


def load_company_universe_from_db(client: Client) -> Optional[pd.DataFrame]:
    """
    Loads company universe from Supabase.
    
    Args:
        client: Supabase client
        
    Returns:
        DataFrame with CIK, Ticker, Company Name columns, or None if error
    """
    try:
        response = client.table('company_universe').select('*').execute()
        df = pd.DataFrame(response.data)
        
        if len(df) > 0:
            print(f"[Supabase] Loaded {len(df)} company records from database")
        
        return df
        
    except Exception as e:
        print(f"[Supabase] Error loading company universe: {e}")
        return None


def save_alerts_to_db(filings: List[Dict], client: Client, table_name: str = "sec_filing_alerts") -> bool:
    """
    Saves dilution alert results to Supabase database.
    
    This function inserts or updates records in the specified table (default: sec_filing_alerts).
    Uses ticker + date + form_type as unique constraint to avoid duplicates.
    
    Note: Uses 'sec_filing_alerts' by default to avoid conflicts with existing 'dilution_alerts' table
    which may have a different schema for other purposes.
    
    Args:
        filings: List of analyzed filing dictionaries
        client: Supabase client
        table_name: Table name to save to (default: sec_filing_alerts)
        
    Returns:
        True if save was successful, False otherwise
    """
    try:
        rows = []
        
        for filing in filings:
            # Skip filings with UNKNOWN ticker
            ticker = filing.get("ticker", "UNKNOWN")
            if not ticker or ticker.upper() == "UNKNOWN":
                continue
            
            # Extract date and datetime
            date_str = filing.get("pubDate") or filing.get("date") or filing.get("filing_date", "")
            date_obj = None
            date_formatted = datetime.now().strftime("%Y-%m-%d")
            filing_datetime = None  # Store full datetime string (ISO format)
            
            try:
                if date_str:
                    from dateutil import parser
                    date_obj = parser.parse(date_str)
                    date_formatted = date_obj.strftime("%Y-%m-%d")
                    # Store full ISO datetime string for time display
                    filing_datetime = date_obj.isoformat()
                else:
                    date_formatted = datetime.now().strftime("%Y-%m-%d")
                    filing_datetime = datetime.now().isoformat()
            except:
                date_formatted = date_str if date_str else datetime.now().strftime("%Y-%m-%d")
                # Try to preserve original datetime string if parsing failed
                filing_datetime = date_str if date_str else datetime.now().isoformat()
            
            # Format red flags and underwriters
            red_flags = ", ".join(sorted(filing.get("red_flags_found", set()))) or None
            underwriters = ", ".join(sorted(filing.get("underwriters_found", set()))) or None
            warrants_found = filing.get("warrants_found", False)
            
            # Extract short seller signals
            signals = filing.get("short_seller_signals", {})
            
            # Build row dictionary matching CSV structure
            row = {
                "date": date_formatted,
                "filing_datetime": filing_datetime,  # Full ISO datetime string for time display
                "ticker": ticker,
                "form_type": filing.get("form_type", "UNKNOWN"),
                "link_to_filing": filing.get("link", filing.get("url", "")),
                "warrants_found": warrants_found,
                "underwriter_found": underwriters,
                "red_flags_found": red_flags,
                "risk_score": filing.get("risk_score", 0),
                # Short seller signals
                "cap_raise_amount": signals.get("offering_amount"),
                "toxic_debt_detected": signals.get("high_interest_debt", False),
                "toxic_debt_snippet": signals.get("high_interest_debt_snippet"),
                "management_turnover": signals.get("resignation_detected", False),
                "resignation_snippet": signals.get("resignation_snippet"),
                "warrant_coverage": signals.get("warrant_coverage"),
                # Parsed filing details
                "base_offering_amount": filing.get("base_offering_amount"),
                "offering_amount": filing.get("base_offering_amount"),  # For backward compatibility
                "share_price": filing.get("share_price"),
                "number_of_shares": filing.get("number_of_shares"),
                "overallotment_shares": filing.get("overallotment_shares"),
                "overallotment_amount": filing.get("overallotment_amount"),
                "has_warrants": filing.get("has_warrants"),
                "warrants_per_share": filing.get("warrants_per_share"),
                "private_placement_shares": filing.get("private_placement_shares"),
                "private_placement_amount": filing.get("private_placement_amount"),
                "additional_dilutions": filing.get("additional_dilutions"),
                "created_at": datetime.now().isoformat(),
            }
            
            # Clean NaN values (convert to None for JSON compatibility)
            cleaned_row = {}
            for key, value in row.items():
                # Check if value is NaN (float or pandas NaN)
                if isinstance(value, float) and math.isnan(value):
                    cleaned_row[key] = None
                elif pd.isna(value) if hasattr(pd, 'isna') else value != value:
                    cleaned_row[key] = None
                else:
                    cleaned_row[key] = value
            
            rows.append(cleaned_row)
        
        # Upsert records (insert or update on conflict)
        # Using ticker + date + form_type as unique key
        for row in rows:
            try:
                # Try to update existing record first
                existing = client.table(table_name).select('id').eq(
                    'ticker', row['ticker']
                ).eq('date', row['date']).eq('form_type', row['form_type']).execute()
                
                if existing.data:
                    # Update existing record
                    client.table(table_name).update(row).eq(
                        'ticker', row['ticker']
                    ).eq('date', row['date']).eq('form_type', row['form_type']).execute()
                else:
                    # Insert new record
                    client.table(table_name).insert(row).execute()
                    
            except Exception as e:
                print(f"[Supabase] Error upserting record for {row['ticker']}: {e}")
                # Fallback: just insert (let database handle constraint)
                try:
                    client.table('dilution_alerts').insert(row).execute()
                except:
                    pass  # Skip if duplicate
        
        print(f"[Supabase] Saved {len(rows)} alerts to {table_name} table")
        return True
        
    except Exception as e:
        print(f"[Supabase] Error saving alerts to database: {e}")
        import traceback
        traceback.print_exc()
        return False


def query_alerts_from_db(
    client: Client,
    ticker: Optional[str] = None,
    form_type: Optional[str] = None,
    min_risk_score: Optional[int] = None,
    days_back: Optional[int] = None,
    limit: int = 100,
    table_name: str = "sec_filing_alerts"
) -> Optional[List[Dict]]:
    """
    Query dilution alerts from Supabase with filters.
    
    Args:
        client: Supabase client
        ticker: Filter by ticker symbol (optional)
        form_type: Filter by form type (optional)
        min_risk_score: Minimum risk score (optional)
        days_back: Only return alerts from last N days (optional)
        limit: Maximum number of results
        table_name: Table name to query (default: sec_filing_alerts)
        
    Returns:
        List of alert dictionaries, or None if error
    """
    try:
        query = client.table(table_name).select('*')
        
        if ticker:
            query = query.eq('ticker', ticker)
        if form_type:
            query = query.eq('form_type', form_type)
        if min_risk_score:
            query = query.gte('risk_score', min_risk_score)
        if days_back:
            cutoff_date = (datetime.now() - pd.Timedelta(days=days_back)).strftime('%Y-%m-%d')
            query = query.gte('date', cutoff_date)
        
        query = query.order('date', desc=True).limit(limit)
        response = query.execute()
        
        return response.data
        
    except Exception as e:
        print(f"[Supabase] Error querying alerts: {e}")
        return None


# SQL Schema for Supabase (run this in Supabase SQL editor):
"""
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

-- SEC Filing Alerts Table (renamed to avoid conflicts with existing dilution_alerts)
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
    -- Short seller signals
    cap_raise_amount NUMERIC,
    toxic_debt_detected BOOLEAN DEFAULT FALSE,
    toxic_debt_snippet TEXT,
    management_turnover BOOLEAN DEFAULT FALSE,
    resignation_snippet TEXT,
    warrant_coverage TEXT,
    -- Parsed filing details
    base_offering_amount TEXT,
    offering_amount TEXT,  -- For backward compatibility
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
    -- Unique constraint to prevent duplicates
    UNIQUE(ticker, date, form_type)
);

CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_date ON sec_filing_alerts(date DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_ticker ON sec_filing_alerts(ticker);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_risk_score ON sec_filing_alerts(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_form_type ON sec_filing_alerts(form_type);
"""
