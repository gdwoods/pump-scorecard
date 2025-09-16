'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

function RiskPill({ score }: { score: number }) {
  let classes = 'bg-green-200 text-green-800';
  if (score >= 70) classes = 'bg-red-200 text-red-800';
  else if (score >= 40) classes = 'bg-yellow-200 text-yellow-800';

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${classes}`}>
      {score}%
    </span>
  );
}

export default function Page() {
  const [ticker, setTicker] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    const res = await fetch(`/api/scan/${ticker}`, { cache: 'no-store' });
    const json = await res.json();
    setResult(json);
  };

  const promotionIcon = (type: string) => {
    switch (type) {
      case 'campaign': return '📢';
      case 'disclosure': return '📄';
      case 'press_release': return '📰';
      default: return '📢';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Logo" width={40} height={40} />
        <h1 className="text-2xl font-bold">Booker Mastermind Pump & Dump Risk Scorecard</h1>
      </div>

      {/* Input */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Enter Ticker (e.g. QMMM)"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
        />
        <Button onClick={scan}>Run Scan</Button>
      </div>

      {/* Results */}
      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Summary */}
          <Card>
            <CardContent>
              <h2 className="text-xl font-bold">
                {result.companyName} ({result.ticker})
              </h2>
              <p>Last price: ${result.last_price?.toFixed(2)} | Volume: {result.latest_volume?.toLocaleString()}</p>
              <div className="space-y-1">
                <p>
                  Flat Risk Score: <RiskPill score={result.flatRiskScore} /> 
                  <span className="text-gray-500 ml-2">(percentage of criteria triggered)</span>
                </p>
                <p>
                  Weighted Risk Score: <RiskPill score={result.weightedRiskScore} /> 
                  <span className="text-gray-500 ml-2">(adjusted for promotions & risky countries)</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Fundamentals */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📈 Fundamentals</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Market Cap: ${result.marketCap?.toLocaleString()}</li>
                <li>Shares Outstanding: {result.sharesOutstanding?.toLocaleString()}</li>
                <li>Float Shares: {result.floatShares?.toLocaleString()}</li>
                <li>Short Float: {result.shortFloat ? (result.shortFloat * 100).toFixed(1) + "%" : "N/A"}</li>
                <li>Insider Ownership: {result.insiderOwn ? (result.insiderOwn * 100).toFixed(1) + "%" : "N/A"}</li>
                <li>Institutional Ownership: {result.instOwn ? (result.instOwn * 100).toFixed(1) + "%" : "N/A"}</li>
                <li>Exchange: {result.exchange}</li>
                <li>
                  Country:{" "}
                  <span className={
                    result.riskyCountry
                      ? "text-red-600 font-semibold"
                      : result.country === "Unknown"
                      ? "text-yellow-600 font-semibold"
                      : "text-green-700 font-semibold"
                  }>
                    {result.country}
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Criteria */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">✅ Criteria</h3>
              <div className="grid grid-cols-2 gap-2">
                <label><input type="checkbox" checked={result.sudden_volume_spike} readOnly /> sudden volume spike</label>
                <label><input type="checkbox" checked={result.sudden_price_spike} readOnly /> sudden price spike</label>
                <label><input type="checkbox" checked={result.valuation_fundamentals_mismatch} readOnly /> valuation fundamentals mismatch</label>
                <label><input type="checkbox" checked={result.reverse_split} readOnly /> reverse split</label>
                <label><input type="checkbox" checked={result.dividend_announced} readOnly /> dividend announced</label>
                <label><input type="checkbox" checked={result.promoted_stock} readOnly /> promoted stock</label>
                <label><input type="checkbox" checked={result.dilution_or_offering} readOnly /> dilution/offering filing</label>
                <label><input type="checkbox" checked={result.riskyCountry} readOnly /> risky country (China/HK/Malaysia)</label>
              </div>
            </CardContent>
          </Card>

          {/* Price & Volume */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📉 Price & Volume (6 months)</h3>
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

          {/* Promotions */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📢 Promotions</h3>
              {result.promotions?.length ? (
                <ul className="list-disc list-inside space-y-1">
                  {result.promotions.map((p: any, idx: number) => (
                    <li key={idx} className="ml-4">
                      {promotionIcon(p.type)} {p.promotion_date} — {p.company_name} — {p.promoting_firm || "Unknown"} — 
                      <a href={p.url} className="text-blue-500 ml-1" target="_blank">View</a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No promotions detected.</p>
              )}
            </CardContent>
          </Card>

          {/* SEC Filings */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">📑 SEC Filings</h3>
              {result.filings?.length ? (
                <ul className="list-disc list-inside space-y-1">
                  {result.filings.map((f: any, idx: number) => (
                    <li key={idx} className="ml-4">
                      <a href={f.url} className="text-blue-500" target="_blank" rel="noopener noreferrer">
                        {f.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recent SEC filings.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
