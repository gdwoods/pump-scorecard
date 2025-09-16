'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

// --- Criteria Groups ---
const groupedSignals = [
  { group: '📈 Market Activity (Auto)', keys: ['sudden_volume_spike', 'sudden_price_spike', 'valuation_fundamentals_mismatch'] },
  { group: '📝 SEC Filings (Auto)', keys: ['reverse_split', 'dilution_or_offering'] },
  { group: '📢 Promotions (Auto)', keys: ['dividend_announced', 'promoted_stock'] },
  { group: '🧠 Manual Review (Manual)', keys: ['impersonated_advisors', 'guaranteed_returns', 'regulatory_alerts_or_investigations'] },
];

const autoSignals = new Set([
  'sudden_volume_spike',
  'sudden_price_spike',
  'valuation_fundamentals_mismatch',
  'reverse_split',
  'dilution_or_offering',
  'dividend_announced',
  'promoted_stock',
]);

const allSignals = groupedSignals.flatMap(g => g.keys);

export default function Page() {
  const [ticker, setTicker] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const reportRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    const res = await fetch(`/api/scan/${ticker}`, { cache: 'no-store' });
    const json = await res.json();
    setResult(json);
    setManualOverrides({});
  };

  const autoTriggered = allSignals.filter(k => autoSignals.has(k) && (result?.[k] ?? false)).length;
  const manualTriggered = allSignals.filter(k => !autoSignals.has(k) && (manualOverrides[k] ?? false)).length;
  const triggeredSignals = autoTriggered + manualTriggered;

  const flatScore = Math.round((triggeredSignals / allSignals.length) * 100);
  const manualPenalty = manualTriggered * 20;
  const weightedScore = Math.min(100, (result?.weightedScore ?? 0) + manualPenalty);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Pump & Dump Risk Scorecard</h1>

      <div className="flex items-center space-x-4">
        <Input placeholder="Enter Ticker (e.g. NAOV)" value={ticker} onChange={e => setTicker(e.target.value)} />
        <Button onClick={scan}>Run Scan</Button>
      </div>

      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Score Summary */}
          <Card>
            <CardContent>
              <h2 className="text-xl font-bold">Pump Scorecard: {result.ticker}</h2>
              <p>Last price: ${result.last_price?.toFixed(2)} | Volume: {result.latest_volume?.toLocaleString()}</p>
              <p>🚨 {triggeredSignals} of {allSignals.length} signals triggered (Auto: {autoTriggered} • Manual: {manualTriggered})</p>
              <p>🎯 Flat Risk Score: <span className="text-blue-600">{flatScore}%</span></p>
              <p>🔥 Weighted Pump Risk Score: <span className={weightedScore >= 70 ? 'text-red-600' : weightedScore >= 40 ? 'text-yellow-600' : 'text-green-600'}>{weightedScore}%</span></p>
            </CardContent>
          </Card>

          {/* Country */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">🌍 Country</h3>
              <p>
                {result.country?.toUpperCase() || "Unknown"}
                {result.riskyCountry && (
                  <span className="ml-2 text-red-600 font-semibold">⚠️ High-Risk Region</span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Criteria */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">Criteria</h3>
              {groupedSignals.map(group => (
                <div key={group.group}>
                  <h4 className="font-semibold">{group.group}</h4>
                  {group.keys.map(sig => {
                    const isAuto = autoSignals.has(sig);
                    const checked = isAuto ? (result?.[sig] ?? false) : (manualOverrides[sig] ?? false);
                    return (
                      <label key={sig} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => !isAuto && setManualOverrides({ ...manualOverrides, [sig]: e.target.checked })}
                          disabled={isAuto}
                        />
                        <span>{sig.replace(/_/g, ' ')}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Chart */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📉 Price & Volume</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result.history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="close" stroke="#8884d8" name="Close" />
                  <Bar yAxisId="right" dataKey="volume" fill="#82ca9d" name="Volume" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* SEC Filings */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📝 SEC Filings</h3>
              {result.split_flags?.length > 0 && (
                <>
                  <h4 className="font-semibold text-purple-600">Reverse Splits</h4>
                  <ul className="list-disc list-inside">
                    {result.split_flags.map((f: any, idx: number) => (
                      <li key={`split-${idx}`}>{f.execution_date} — {f.description}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.offering_flags?.length > 0 && (
                <>
                  <h4 className="font-semibold text-red-600">Dilution / Offerings</h4>
                  <ul className="list-disc list-inside">
                    {result.offering_flags.map((f: any, idx: number) => (
                      <li key={`offering-${idx}`}>
                        {f.date} — {f.description}{" "}
                        {f.url && (
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(View)</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {result.dividend_flags?.length > 0 && (
                <>
                  <h4 className="font-semibold text-green-600">Dividends</h4>
                  <ul className="list-disc list-inside">
                    {result.dividend_flags.map((f: any, idx: number) => (
                      <li key={`div-${idx}`}>{f.ex_dividend_date} — ${f.cash_amount} (freq: {f.frequency})</li>
                    ))}
                  </ul>
                </>
              )}
              {(!result.split_flags?.length && !result.offering_flags?.length && !result.dividend_flags?.length) && (
                <p>No SEC filings flagged.</p>
              )}
            </CardContent>
          </Card>

          {/* Promotions */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold text-red-700">🔴 Stock Promotions</h3>
              {result.promoted_stock ? (
                <div className="space-y-4">
                  {result.promotions.campaigns?.length > 0 && (
                    <>
                      <h4 className="font-semibold text-red-600">📢 Campaigns</h4>
                      <ul className="list-disc list-inside">
                        {result.promotions.campaigns.map((p: any, idx: number) => (
                          <li key={`campaign-${idx}`}>
                            {p.promotion_date} — {p.company_name} ({p.ticker}) via {p.promoting_firm}{" "}
                            <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(View)</a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {result.promotions.disclosures?.length > 0 && (
                    <>
                      <h4 className="font-semibold text-yellow-600">📑 Disclosures</h4>
                      <ul className="list-disc list-inside">
                        {result.promotions.disclosures.map((p: any, idx: number) => (
                          <li key={`disc-${idx}`}>
                            {p.promotion_date} — {p.company_name} ({p.ticker}) via {p.promoting_firm}{" "}
                            <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(View)</a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {result.promotions.pressReleases?.length > 0 && (
                    <>
                      <h4 className="font-semibold text-blue-600">📰 Promoted Press Releases</h4>
                      <ul className="list-disc list-inside">
                        {result.promotions.pressReleases.map((p: any, idx: number) => (
                          <li key={`press-${idx}`}>
                            {p.promotion_date} — {p.company_name} ({p.ticker}) via {p.promoting_firm}{" "}
                            <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">(View)</a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <p>No promotions detected.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
