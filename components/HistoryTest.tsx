"use client";

import { useState } from "react";
import { saveScanToHistory, getHistory, getAllTickers, clearHistory } from "@/lib/history";

export default function HistoryTest() {
  const [testResult, setTestResult] = useState<string>("");

  const testHistory = () => {
    try {
      // Clear existing history
      clearHistory();
      
      // Add a test scan
      saveScanToHistory({
        ticker: "TEST",
        score: 50,
        baseScore: 45,
        adjustedScore: 50,
        verdict: "Moderate risk",
        summary: "Test scan for debugging",
        factors: [
          { label: "Test factor", value: 5, color: "text-red-400" }
        ],
        marketCap: 1000000,
        price: 10.50,
        volume: 100000,
        droppinessScore: 60,
        fraudEvidence: false,
        promotions: false,
        riskyCountry: false,
      });

      // Check if it was saved
      const history = getHistory();
      const allTickers = getAllTickers();
      
      setTestResult(`✅ Test successful! History length: ${history.length}, Tickers: ${allTickers.join(", ")}`);
    } catch (error) {
      setTestResult(`❌ Test failed: ${error}`);
    }
  };

  const checkCurrentHistory = () => {
    try {
      const history = getHistory();
      const allTickers = getAllTickers();
      setTestResult(`Current history: ${history.length} scans, Tickers: ${allTickers.join(", ")}`);
    } catch (error) {
      setTestResult(`❌ Check failed: ${error}`);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900">
      <h3 className="text-lg font-semibold mb-2">🧪 History Test</h3>
      <div className="space-y-2">
        <button
          onClick={testHistory}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
        >
          Test History Save
        </button>
        <button
          onClick={checkCurrentHistory}
          className="px-3 py-1 bg-green-500 text-white rounded text-sm ml-2"
        >
          Check Current History
        </button>
        {testResult && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
            {testResult}
          </div>
        )}
      </div>
    </div>
  );
}
