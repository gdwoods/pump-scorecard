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

const groupedSignals = [
  { group: '📈 Market Activity (Auto)', keys: ['sudden_volume_spike', 'sudden_price_spike', 'valuation_fundamentals_mismatch', 'no_fundamental_news'] },
  { group: '📝 SEC Filings (Auto)', keys: ['reverse_split_or_dilution', 'recent_auditor_change', 'insider_or_major_holder_selloff'] },
  { group: '📣 Social Media (Auto)', keys: ['rapid_social_acceleration', 'social_media_promotion', 'whatsapp_or_vip_group'] },
  { group: '🧠 Manual Review (Manual)', keys: ['impersonated_advisors', 'guaranteed_returns', 'regulatory_alerts_or_investigations'] },
];

const autoSignals = new Set([
  'sudden_volume_spike','sudden_price_spike','valuation_fundamentals_mismatch','no_fundamental_news',
  'reverse_split_or_dilution','recent_auditor_change','insider_or_major_holder_selloff',
  'rapid_social_acceleration','social_media_promotion','whatsapp_or_vip_group',
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
    if (!reportRef.current) return;
    const dataUrl = await htmlToImage.toPng(reportRef.current, { cacheBust: true });
    const pdf = new jsPDF();
    const width = pdf.internal.pageSize.getWidth();
    const height = (reportRef.current.offsetHeight * width) / reportRef.current.offsetWidth;
    pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
    pdf.save(`${ticker}_pump_scorecard.pdf`);
  };

  const autoTriggered = allSignals.filter(k => autoSignals.has(k) && (result?.[k] ?? false)).length;
  const manualTriggered = allSignals.filter(k => !autoSignals.has(k) && (manualOverrides[k] ?? false)).length;
  const triggeredSignals = autoTriggered + manualTriggered;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">Pump & Dump Risk Scorecard</h1>

      {/* Controls */}
      <div className="flex items-center space-x-4">
        <Input placeholder="Enter Ticker (e.g. QMMM)" value={ticker} onChange={e => setTicker(e.target.value)} />
        <Button onClick={scan}>Run Scan</Button>
        {result && <Button onClick={exportPDF}>Export PDF</Button>}
      </div>

      {result && (
        <div ref={reportRef} className="space-y-6">
          {/* Scorecard Header */}
          <Card><CardContent>
            <h2 className="text-xl font-bold">Pump Scorecard: {result.ticker}</h2>
            <p>🚨 <strong>{triggeredSignals}</strong> of {allSignals.length} signals triggered</p>
          </CardContent></Card>

          {/* Criteria */}
          <Card><CardContent>
            <h3 className="text-lg font-bold">Criteria</h3>
            {groupedSignals.map(group => (
              <div key={group.group} className="mb-4">
                <h4 className="font-semibold">{group.group}</h4>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {group.keys.map(sig => {
                    const isAuto = autoSignals.has(sig);
                    const checked = isAuto ? (result?.[sig] ?? false) : (manualOverrides[sig] ?? false);
                    return (
                      <label key={sig} className="flex items-center justify-between border px-3 py-2 rounded-md">
                        <span>{sig.replace(/_/g, ' ')}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (!isAuto) setManualOverrides({ ...manualOverrides, [sig]: e.target.checked });
                          }}
                          disabled={isAuto}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent></Card>

          {/* Squeeze Risk */}
          <Card><CardContent>
            <h3 className="text-lg font-bold">🧨 Squeeze Risk Score</h3>
            <p className={riskColor(result.squeezeRiskScore)}>
              {result.squeezeLabel} ({result.squeezeRiskScore}/100)
            </p>
          </CardContent></Card>

          {/* SEC Filings */}
          <Card><CardContent>
            <h3 className="text-lg font-bold">📝 SEC Filings</h3>
            {Array.isArray(result.sec_flags) && result.sec_flags.length > 0 ? (
              <ul className="list-disc pl-6">
                {result.sec_flags.map((f: any, idx: number) => (
                  <li key={idx}>{f.date} — {f.form} — {f.reason}</li>
                ))}
              </ul>
            ) : <p className="text-gray-400">No recent SEC filings flagged.</p>}
          </CardContent></Card>

          {/* Social Media */}
          <Card><CardContent>
            <h3 className="text-lg font-bold">📣 Social Media Hype</h3>
            {result?.hype ? (
              <>
                <p>Reddit Mentions: {result.hype.redditMentions}</p>
                <p>Twitter Mentions: {result.hype.twitterMentions}</p>
              </>
            ) : <p className="text-gray-400">No hype data available.</p>}
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
