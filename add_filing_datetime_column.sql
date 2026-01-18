-- Add filing_datetime column to sec_filing_alerts table
-- This column stores the full ISO datetime string for filings (includes time, not just date)

ALTER TABLE sec_filing_alerts 
ADD COLUMN IF NOT EXISTS filing_datetime TIMESTAMP WITH TIME ZONE;

-- Add a comment to document the column
COMMENT ON COLUMN sec_filing_alerts.filing_datetime IS 'Full ISO datetime string (includes time) when filing was accepted by SEC';

-- Update existing rows to set filing_datetime based on date (if date column exists)
-- This is optional but helpful for existing data
UPDATE sec_filing_alerts 
SET filing_datetime = (date || 'T00:00:00')::TIMESTAMP WITH TIME ZONE
WHERE filing_datetime IS NULL AND date IS NOT NULL;
