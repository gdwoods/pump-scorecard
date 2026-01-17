import React, { useState, useMemo } from 'react';

interface CompanyActivity {
  id: number;
  source: 'email' | 'telegram';
  email_id?: string;
  message_id: string;
  ticker: string;
  activity_category: 'Offering PR' | 'Private Placement' | 'Prospectus Filing' | 'Reverse Split';
  activity_subtype?: string;
  amount_millions?: number;
  description?: string;
  notification_date: string;
  email_subject?: string;
}

interface DilutionTrackerData {
  activities: CompanyActivity[];
  totalActivities: number;
  recentActivities: number;
  totalRaised: number;
  riskScore: number;
  categories: {
    offeringPR: number;
    privatePlacement: number;
    prospectusFilings: number;
    reverseSplits: number;
  };
}

interface DilutionTrackerCardProps {
  ticker: string;
  dilutionTracker: DilutionTrackerData | null;
}

export default function DilutionTrackerCard({ ticker, dilutionTracker }: DilutionTrackerCardProps) {
  const [filter, setFilter] = useState<'all' | 'Offering PR' | 'Private Placement' | 'Prospectus Filing' | 'Reverse Split'>('all');
  const [showAll, setShowAll] = useState(false);

  if (!dilutionTracker || dilutionTracker.totalActivities === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>💧</span> {ticker} Dilution History
        </h3>
        <p className="text-gray-500 dark:text-gray-400 italic">
          No dilution activities found in DilutionTracker database.
        </p>
      </div>
    );
  }

  const { riskScore, totalActivities, recentActivities, totalRaised, categories, activities } = dilutionTracker;

  // Determine color based on risk score
  const scoreColor = riskScore >= 70 ? "text-red-500" : riskScore >= 40 ? "text-yellow-500" : "text-green-500";
  const progressColor = riskScore >= 70 ? "bg-red-500" : riskScore >= 40 ? "bg-yellow-500" : "bg-green-500";

  const riskLabel = riskScore >= 70 ? "High Risk" : riskScore >= 40 ? "Moderate Risk" : "Low Risk";

  // Filter activities based on selected filter
  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    return activities.filter(activity => activity.activity_category === filter);
  }, [activities, filter]);

  // Limit displayed activities
  const displayedActivities = showAll ? filteredActivities : filteredActivities.slice(0, 5);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>💧</span> {ticker} Dilution History
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Risk Score Section */}
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <span className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold mb-2">Dilution Risk</span>
          <div className={`text-4xl font-bold ${scoreColor}`}>{riskScore}/100</div>
          <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full mt-3 overflow-hidden">
            <div className={`h-full ${progressColor}`} style={{ width: `${riskScore}%` }}></div>
          </div>
          <p className={`text-sm font-semibold mt-2 ${scoreColor}`}>
            {riskLabel}
          </p>
        </div>

        {/* Stats Section */}
        <div className="flex flex-col justify-center space-y-2">
          <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Activities</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">{totalActivities}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
            <span className="text-sm font-medium text-orange-700 dark:text-orange-400">Recent (30d)</span>
            <span className="font-bold text-orange-700 dark:text-orange-400">{recentActivities}</span>
          </div>
          {totalRaised > 0 && (
            <div className="flex justify-between items-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Total Raised</span>
              <span className="font-bold text-blue-700 dark:text-blue-400">${totalRaised.toFixed(1)}M</span>
            </div>
          )}
        </div>

        {/* Category Breakdown - Now clickable filters */}
        <div className="flex flex-col justify-center space-y-2">
          {categories.offeringPR > 0 && (
            <button
              onClick={() => setFilter(filter === 'Offering PR' ? 'all' : 'Offering PR')}
              className={`flex justify-between items-center p-2 rounded border transition-all cursor-pointer text-sm ${
                filter === 'Offering PR'
                  ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 ring-2 ring-purple-400'
                  : 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/30'
              }`}
            >
              <span className="font-medium text-purple-700 dark:text-purple-400">Offering PRs</span>
              <span className="font-bold text-purple-700 dark:text-purple-400">{categories.offeringPR}</span>
            </button>
          )}
          {categories.privatePlacement > 0 && (
            <button
              onClick={() => setFilter(filter === 'Private Placement' ? 'all' : 'Private Placement')}
              className={`flex justify-between items-center p-2 rounded border transition-all cursor-pointer text-sm ${
                filter === 'Private Placement'
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-400'
                  : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
              }`}
            >
              <span className="font-medium text-indigo-700 dark:text-indigo-400">Private Placements</span>
              <span className="font-bold text-indigo-700 dark:text-indigo-400">{categories.privatePlacement}</span>
            </button>
          )}
          {categories.prospectusFilings > 0 && (
            <button
              onClick={() => setFilter(filter === 'Prospectus Filing' ? 'all' : 'Prospectus Filing')}
              className={`flex justify-between items-center p-2 rounded border transition-all cursor-pointer text-sm ${
                filter === 'Prospectus Filing'
                  ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              }`}
            >
              <span className="font-medium text-amber-700 dark:text-amber-400">SEC Filings</span>
              <span className="font-bold text-amber-700 dark:text-amber-400">{categories.prospectusFilings}</span>
            </button>
          )}
          {categories.reverseSplits > 0 && (
            <button
              onClick={() => setFilter(filter === 'Reverse Split' ? 'all' : 'Reverse Split')}
              className={`flex justify-between items-center p-2 rounded border transition-all cursor-pointer text-sm ${
                filter === 'Reverse Split'
                  ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 ring-2 ring-red-400'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/30'
              }`}
            >
              <span className="font-medium text-red-700 dark:text-red-400">Reverse Splits</span>
              <span className="font-bold text-red-700 dark:text-red-400">{categories.reverseSplits}</span>
            </button>
          )}
        </div>
      </div>

      {/* Activities List */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            {filter === 'all' ? 'Recent Activities' : filter}
            {' '}(showing {displayedActivities.length} of {filteredActivities.length})
          </h4>
          {filteredActivities.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAll ? 'Show Less' : `Show All (${filteredActivities.length})`}
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {displayedActivities.map((activity) => (
            <div
              key={activity.id}
              className="p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    activity.activity_category === 'Offering PR' ? 'bg-purple-200 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200' :
                    activity.activity_category === 'Private Placement' ? 'bg-indigo-200 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200' :
                    activity.activity_category === 'Prospectus Filing' ? 'bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' :
                    'bg-red-200 dark:bg-red-900/40 text-red-800 dark:text-red-200'
                  }`}>
                    {activity.activity_category}
                  </span>
                  {activity.activity_subtype && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {activity.activity_subtype}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(activity.notification_date).toLocaleDateString()}
                </span>
              </div>

              {activity.amount_millions && (
                <div className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">
                  ${activity.amount_millions.toFixed(2)}M raised
                </div>
              )}

              {activity.description && (
                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                  {activity.description}
                </p>
              )}

              {activity.email_subject && (
                <p className="text-xs text-gray-600 dark:text-gray-300 italic">
                  {activity.email_subject}
                </p>
              )}

              <div className="mt-1 text-xs text-gray-400">
                Source: {activity.source === 'email' ? '📧 Email' : '💬 Telegram'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
