"use client";

import { useState, useEffect } from "react";
import { tickerCache, fundamentalsCache, historyCache } from "@/lib/cache";

export default function PerformanceMonitor() {
  const [stats, setStats] = useState({
    ticker: { size: 0, maxSize: 0 },
    fundamentals: { size: 0, maxSize: 0 },
    history: { size: 0, maxSize: 0 },
  });

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateStats = () => {
      setStats({
        ticker: tickerCache.getStats(),
        fundamentals: fundamentalsCache.getStats(),
        history: historyCache.getStats(),
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded text-xs opacity-50 hover:opacity-100 transition-opacity"
      >
        📊 Cache Stats
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-3 rounded-lg text-xs max-w-xs z-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold">Cache Performance</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Ticker Cache:</span>
          <span>{stats.ticker.size}/{stats.ticker.maxSize}</span>
        </div>
        <div className="flex justify-between">
          <span>Fundamentals:</span>
          <span>{stats.fundamentals.size}/{stats.fundamentals.maxSize}</span>
        </div>
        <div className="flex justify-between">
          <span>History:</span>
          <span>{stats.history.size}/{stats.history.maxSize}</span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-700">
        <button
          onClick={() => {
            tickerCache.clear();
            fundamentalsCache.clear();
            historyCache.clear();
          }}
          className="text-red-400 hover:text-red-300 text-xs"
        >
          Clear All Caches
        </button>
      </div>
    </div>
  );
}
