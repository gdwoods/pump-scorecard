"""
Price Tracking Update: Updates price_7days_later for filings that are 7+ days old

This module provides a function to check filings that are 7+ days old and update
their price_7days_later field with the current stock price.
"""

from datetime import datetime, timedelta
from typing import Optional
from supabase import Client
from price_filter import fetch_current_stock_price
import time


def update_price_tracking(client: Client, table_name: str = "sec_filing_alerts") -> int:
    """
    Updates price_7days_later for filings that are 7+ days old.
    
    This function:
    1. Finds filings where date is >= 7 days ago
    2. Where price_7days_later is NULL
    3. Fetches current stock price for each ticker
    4. Updates the price_7days_later column
    
    Args:
        client: Supabase client
        table_name: Table name (default: sec_filing_alerts)
        
    Returns:
        Number of filings updated
    """
    try:
        # Calculate date 7 days ago
        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        # Query filings that are 7+ days old and don't have price_7days_later set
        # Note: We use lte (less than or equal) to find filings with date <= seven_days_ago (older filings)
        response = client.table(table_name).select('id, ticker, date, price_7days_later').lte(
            'date', seven_days_ago
        ).is_('price_7days_later', 'null').execute()
        
        filings_to_update = response.data
        
        if not filings_to_update:
            return 0
        
        print(f"[Price Tracking] Found {len(filings_to_update)} filings that need 7-day price updates")
        
        updated_count = 0
        
        # Group by ticker to avoid fetching same price multiple times
        ticker_prices = {}
        
        for filing in filings_to_update:
            ticker = filing.get('ticker', '').upper()
            filing_date_str = filing.get('date', '')
            
            if not ticker or ticker == 'UNKNOWN':
                continue
            
            # Skip if already has price (safety check)
            if filing.get('price_7days_later'):
                continue
            
            # Calculate if filing is at least 7 days old
            try:
                filing_date = datetime.strptime(filing_date_str, "%Y-%m-%d")
                days_since_filing = (datetime.now() - filing_date).days
                
                if days_since_filing < 7:
                    continue  # Not old enough yet
            except (ValueError, TypeError):
                continue
            
            # Fetch price if not already fetched for this ticker
            if ticker not in ticker_prices:
                print(f"[Price Tracking] Fetching 7-day price for {ticker}...")
                price = fetch_current_stock_price(ticker)
                ticker_prices[ticker] = price
                
                # Rate limit: delay between Yahoo Finance requests
                time.sleep(0.5)
            else:
                price = ticker_prices[ticker]
            
            if price:
                # Update the filing with the 7-day price
                try:
                    client.table(table_name).update({
                        'price_7days_later': float(price)
                    }).eq('id', filing['id']).execute()
                    
                    updated_count += 1
                    print(f"[Price Tracking]   Updated {ticker} (filing {filing_date_str}): ${price:.2f}")
                except Exception as e:
                    print(f"[Price Tracking]   Error updating {ticker}: {e}")
        
        return updated_count
        
    except Exception as e:
        print(f"[Price Tracking] Error updating price tracking: {e}")
        import traceback
        traceback.print_exc()
        return 0
