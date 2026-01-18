-- Add price tracking columns to sec_filing_alerts table
-- These columns track stock price at filing time and 7 days later

ALTER TABLE sec_filing_alerts
ADD COLUMN IF NOT EXISTS price_at_filing NUMERIC(10, 4) NULL,
ADD COLUMN IF NOT EXISTS price_7days_later NUMERIC(10, 4) NULL;

-- Add index for efficient querying of filings that need price_7days_later updates
-- (filings where date is >= 7 days ago and price_7days_later is NULL)
CREATE INDEX IF NOT EXISTS idx_price_tracking_update 
ON sec_filing_alerts(date) 
WHERE price_7days_later IS NULL;

-- Add comment to columns
COMMENT ON COLUMN sec_filing_alerts.price_at_filing IS 'Stock price at the time of filing (captured when filing is first detected)';
COMMENT ON COLUMN sec_filing_alerts.price_7days_later IS 'Stock price 7 days after filing date (captured on subsequent scans)';
