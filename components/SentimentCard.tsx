import React, { useState, useMemo } from 'react';

interface SentimentCardProps {
    ticker: string;
    sentiment: {
        score: number;
        bullish: number;
        bearish: number;
        messages: any[];
    } | null;
}

export default function SentimentCard({ ticker, sentiment }: SentimentCardProps) {
    const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');

    if (!sentiment) return null;

    const { score, bullish, bearish, messages } = sentiment;

    // Determine color based on score (higher score = more bullish/risky)
    const scoreColor = score > 60 ? "text-red-500" : score > 40 ? "text-yellow-500" : "text-green-500";
    const progressColor = score > 60 ? "bg-red-500" : score > 40 ? "bg-yellow-500" : "bg-green-500";

    // Filter messages based on selected filter
    const filteredMessages = useMemo(() => {
        if (filter === 'all') return messages;
        if (filter === 'bullish') {
            return messages.filter(msg => msg.entities?.sentiment?.basic === 'Bullish');
        }
        if (filter === 'bearish') {
            return messages.filter(msg => msg.entities?.sentiment?.basic === 'Bearish');
        }
        return messages;
    }, [messages, filter]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span>🐦</span> {ticker} Social Sentiment (StockTwits)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Score Section */}
                <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <span className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold mb-2">Bullish Score</span>
                    <div className={`text-4xl font-bold ${scoreColor}`}>{score}/100</div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full mt-3 overflow-hidden">
                        <div className={`h-full ${progressColor}`} style={{ width: `${score}%` }}></div>
                    </div>
                    <p className="text-xs text-center mt-2 text-gray-500">
                        Higher score = More hype/risk
                    </p>
                </div>

                {/* Stats Section - Now clickable filters */}
                <div className="flex flex-col justify-center space-y-4">
                    <button
                        onClick={() => setFilter(filter === 'bullish' ? 'all' : 'bullish')}
                        className={`flex justify-between items-center p-3 rounded border transition-all cursor-pointer ${filter === 'bullish'
                            ? 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 ring-2 ring-green-400'
                            : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/30'
                            }`}
                    >
                        <span className="font-medium text-green-700 dark:text-green-400">Bullish Msgs</span>
                        <span className="font-bold text-green-700 dark:text-green-400 text-lg">{bullish}</span>
                    </button>
                    <button
                        onClick={() => setFilter(filter === 'bearish' ? 'all' : 'bearish')}
                        className={`flex justify-between items-center p-3 rounded border transition-all cursor-pointer ${filter === 'bearish'
                            ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 ring-2 ring-red-400'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/30'
                            }`}
                    >
                        <span className="font-medium text-red-700 dark:text-red-400">Bearish Msgs</span>
                        <span className="font-bold text-red-700 dark:text-red-400 text-lg">{bearish}</span>
                    </button>
                </div>

                {/* Messages Preview */}
                <div className="md:col-span-1 overflow-y-auto max-h-40 pr-2">
                    <h4 className="text-sm font-semibold mb-2 text-gray-600 dark:text-gray-300">
                        {filter === 'all' ? 'Recent Messages' : filter === 'bullish' ? 'Bullish Messages' : 'Bearish Messages'}
                        {' '}(showing {Math.min(5, filteredMessages.length)} of {filteredMessages.length})
                    </h4>
                    {filteredMessages.length > 0 ? (
                        <div className="space-y-2">
                            {filteredMessages.slice(0, 5).map((msg: any) => (
                                <a
                                    key={msg.id}
                                    href={`https://stocktwits.com/${msg.user.username}/message/${msg.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-100 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                                >
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-blue-500">{msg.user.username}</span>
                                        <span className="text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <p className="line-clamp-2">{msg.body}</p>
                                </a>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No {filter === 'all' ? '' : filter} messages found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
