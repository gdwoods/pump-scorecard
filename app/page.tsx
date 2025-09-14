'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';
import jsPDF from 'jspdf';
import * as htmlToImage from 'html-to-image';

// === Grouped criteria ===
const groupedSignals = [
  { group: '📈 Market Activity (Auto)', keys: ['sudden_volume_spike', 'sudden_price_spike', 'valuation_fundamentals_mismatch', 'no_fundamental_news'] },
  { group: '📝 SEC Filings (Auto)', keys: ['reverse_split_or_dilution', 'recent_auditor_change', 'insider_or_major_holder_selloff'] },
  { group: '🧠 Manual Review (Manual)', keys: [
      'impersonated_advisors',
      'guaranteed_returns',
      'regulatory_alerts_or_investigations',
      'rapid_social_acceleration',
      'social_media_promotion',
      'whatsapp_or_vip_group'
    ]
  },
];

// === Auto only signals ===
const autoSignals = new Set([
  'sudden_volume_spike','sudden_price_spike','valuation_fundamentals_mismatch','no_fundamental_news',
  'reverse_split_or_dilution','recent_auditor_change','insider_or_major_holder_selloff'
]);

const allSignals = groupedSignals.flatMap(g => g.keys);

const riskColor = (score: number) => {
  if (score >= 80) return 'text-red-600 font-bold';
  if (score >= 60) return 'text-orange-500 font-bold';
  if (score >= 40) return 'text-yellow-600 font-bold';
  return 'text-green-600 font-bold';
};

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

  const exportPDF = async () => {
    const node = reportRef.current!;
    if (!node) return;
    const dataUrl = await htmlToImage.toPng(node, { cacheBust: true });
    const pdf = new jsPDF();
    const width = pdf.internal.pageSize.getWidth();
    const height = (node.offsetHeight * width) / node.offsetWidth;
    const logo = new Image();
    logo.src = '/logo.png';
    await new Promise(resolve => { logo.onload = resolve; });
    pdf.addImage(logo, 'PNG', 10, 10, 30, 30);
    pdf.setFontSize(16);
    pdf.text('Pump & Dump Risk Scorecard', 50, 25);
    pdf.addImage(dataUrl, 'PNG', 0, 50, width, height);
    pdf.setFontSize(8);
    pdf.text(`Scan Timestamp: ${new Date().toLocaleString()}`, 10, pdf.internal.pageSize.getHeight() - 10);
    pdf.save(`${ticker}_pump_scorecard.pdf`);
  };

  const autoTriggered = allSignals.filter(k => autoSignals.has(k) && (result?.[k] ?? false)).length;
  const manualTriggered = allSignals.filter(k => !autoSignals.has(k) && (manualOverrides[k] ?? false)).length;
  const triggeredSignals = autoTriggered + manualTriggered;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-6">
        <img src="/logo.png" alt="Logo" className="h-12 w-auto rounded" />
        <h1 className="text-2xl font-bold">Pump & Dump Risk Scorecard</h1>
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        <Input placeholder="Enter Ticker (e.g. QMMM)" value={ticker} onChange={e => setTicker(e.target.value)} />
        <Button onClick={scan}>Run Scan</Button>
        {result && <Button onClick={exportPDF}>Export PDF</Button>}
      </div>

      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Scorecard Header */}
          <Card><CardContent className="p-4">
            <h2 className="text-xl font-bold">Pump Scorecard: {result.ticker}</h2>
            <p className="text-sm text-muted-foreground">
              Last price: ${result.last_price?.toFixed(2)} | Volume: {result.latest_volume?.toLocaleString()}
            </p>
            <p className="mt-2">
              🚨 <strong>{triggeredSignals}</strong> of {allSignals.length} signals triggered
              <span className="ml-2 text-xs text-gray-500">(Auto: {autoTriggered} • Manual: {manualTriggered})</span>
            </p>
          </CardContent></Card>

          {/* Criteria */}
          <Card><CardContent className="p-4">
            <h3 className="text-lg font-bold">Criteria</h3>
            {groupedSignals.map(group => (
              <div key={group.group} className="mb-4">
                <h4 className="font-semibold">{group.group}</h4>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {group.keys.map((sig) => {
                    const isAuto = autoSignals.has(sig);
                    const checked = isAuto ? (result?.[sig] ?? false) : (manualOverrides[sig] ?? false);
                    return (
                      <label key={sig} className={`flex items-center justify-between rounded-md border px-3 py-2 ${isAuto ? 'bg-slate-50 border-slate-200' : 'bg-white'}`}>
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (isAuto) return;
                              setManualOverrides({ ...manualOverrides, [sig]: e.target.checked });
                            }}
                            disabled={isAuto}
                          />
                          <span>{sig.replace(/_/g, ' ')}</span>
                        </span>
                        <span className={`text-sm ${checked ? 'text-red-600' : 'text-green-600'}`}>
                          {checked ? 'Triggered' : 'Clear'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent></Card>

          {/* Market Data */}
          <Card><CardContent className="p-4 grid grid-cols-2 gap-4">
            <p><strong>Market Cap:</strong> {result.marketCap ? `$${result.marketCap.toLocaleString()}` : 'N/A'}</p>
            <p><strong>Shares Outstanding:</strong> {result.sharesOutstanding?.toLocaleString() ?? 'N/A'}</p>
            <p><strong>Float Shares:</strong> {result.floatShares?.toLocaleString() ?? 'N/A'}</p>
            <p><strong>Float Turnover %:</strong> {result.floatShares ? ((result.latest_volume / result.floatShares) * 100).toFixed(1) + '%' : 'N/A'}</p>
            <p><strong>Short Float %:</strong> {result.shortFloat != null ? result.shortFloat + '%' : 'N/A'}</p>
            <p><strong>Institutional Ownership:</strong> {result.instOwn != null ? result.instOwn + '%' : 'N/A'}</p>
            <p><strong>Insider Ownership:</strong> {result.insiderOwn != null ? result.insiderOwn + '%' : 'N/A'}</p>
          </CardContent></Card>

          {/* Squeeze Risk */}
          <Card><CardContent className="p-4">
            <h3 className="text-lg font-bold">🧨 Squeeze Risk Score</h3>
            <p className={riskColor(result.squeezeRiskScore)}>
              {result.squeezeLabel} ({Math.min(result.squeezeRiskScore,100)}/100)
            </p>
          </CardContent></Card>

          {/* Historical Chart */}
          <Card><CardContent className="p-4">
            <h3 className="text-lg font-bold">📉 Historical Price & Volume</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={result.history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" orientation="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="close" stroke="#8884d8" name="Close Price" />
                <Bar yAxisId="right" dataKey="volume" fill="#82ca9d" name="Volume" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>

          {/* SEC Filings */}
          <Card><CardContent className="p-4">
            <h3 className="text-lg font-bold">📝 SEC Filings</h3>
            {result.sec_flags?.length ? (
              <ul className="list-disc pl-6">
                {result.sec_flags.map((f: any, idx: number) => (
                  <li key={idx}>
                    {f.date} — {f.form} — {f.reason}{' '}
                    {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">[link]</a>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-gray-400">No recent SEC filings flagged.</p>}
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
