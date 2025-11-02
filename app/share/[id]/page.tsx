"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import ShortCheckResults from "@/components/short-check/ShortCheckResults";
import { ShortCheckResult } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";

interface ShareData {
  ticker: string;
  extractedData: ExtractedData;
  result: ShortCheckResult;
  createdAt: number;
  expiresAt: number;
}

export default function SharePage() {
  const params = useParams();
  const shareId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareData | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    async function fetchShareData() {
      try {
        const response = await fetch(`/api/share/${shareId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Share link not found");
          } else if (response.status === 410) {
            setError("This share link has expired (links expire after 7 days)");
          } else {
            setError("Failed to load shared analysis");
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setShareData(data);
      } catch (err: any) {
        console.error("Error fetching share data:", err);
        setError("Failed to load shared analysis");
      } finally {
        setLoading(false);
      }
    }

    fetchShareData();
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading shared analysis...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !shareData) {
    const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const isExpired = error?.includes('expired');
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-4xl mb-4">🔗</div>
            <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
              Share Link Error
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {error || "Unable to load shared analysis"}
            </p>
            {isDevelopment && !isExpired && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-left">
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  <strong>Local Development Note:</strong> Share links use in-memory storage. 
                  If the dev server restarted or hot-reloaded, the link data was cleared. 
                  For persistent links, set up Vercel KV or keep the server running.
                </p>
              </div>
            )}
            <a
              href="/short-check"
              className="inline-block mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
            >
              Back to Short Check
            </a>
          </div>
        </Card>
      </div>
    );
  }

  const expiresDate = new Date(shareData.expiresAt);
  const daysUntilExpiry = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Banner */}
        <Card className="p-4 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                📤 Shared Short Check Analysis
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Analysis for <span className="font-semibold">{shareData.ticker}</span> • 
                Shared on {new Date(shareData.createdAt).toLocaleDateString()} • 
                Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
              </p>
            </div>
            <a
              href="/short-check"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Analyze Your Own
            </a>
          </div>
        </Card>

        {/* Results */}
        <ShortCheckResults
          result={shareData.result}
          ticker={shareData.ticker}
          extractedData={shareData.extractedData}
        />
      </div>
    </div>
  );
}

