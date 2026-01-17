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

-- SEC Filing Alerts Table
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
    cap_raise_amount NUMERIC,
    toxic_debt_detected BOOLEAN DEFAULT FALSE,
    toxic_debt_snippet TEXT,
    management_turnover BOOLEAN DEFAULT FALSE,
    resignation_snippet TEXT,
    warrant_coverage TEXT,
    base_offering_amount TEXT,
    offering_amount TEXT,
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
    UNIQUE(ticker, date, form_type)
);

CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_date ON sec_filing_alerts(date DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_ticker ON sec_filing_alerts(ticker);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_risk_score ON sec_filing_alerts(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filing_alerts_form_type ON sec_filing_alerts(form_type);
