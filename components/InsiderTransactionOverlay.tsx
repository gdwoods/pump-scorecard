import React from 'react';
import { InsiderTransaction } from '@/utils/fetchInsiderTransactions';

interface InsiderTransactionOverlayProps {
    transactions: InsiderTransaction[];
    history: any[]; // Price history data
}

export default function InsiderTransactionOverlay({
    transactions,
    history
}: InsiderTransactionOverlayProps) {
    if (!transactions || transactions.length === 0) return null;

    return (
        <div className="mt-4 p-4 border rounded-lg bg-white dark:bg-gray-800 shadow">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>📊</span> Insider Transactions
            </h3>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="text-left p-2 font-semibold">Date</th>
                            <th className="text-left p-2 font-semibold">Type</th>
                            <th className="text-left p-2 font-semibold">Insider</th>
                            <th className="text-left p-2 font-semibold">Title</th>
                            <th className="text-right p-2 font-semibold">Shares</th>
                            <th className="text-right p-2 font-semibold">Price</th>
                            <th className="text-right p-2 font-semibold">Value</th>
                            <th className="text-center p-2 font-semibold">Filing</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.slice(0, 20).map((tx, idx) => {
                            const isBuy = tx.transactionType === 'buy';
                            const isSell = tx.transactionType === 'sell';

                            return (
                                <tr
                                    key={idx}
                                    className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <td className="p-2 text-gray-700 dark:text-gray-300">
                                        {new Date(tx.date).toLocaleDateString()}
                                    </td>
                                    <td className="p-2">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${isBuy ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                isSell ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                            }`}>
                                            {isBuy && '↑'}
                                            {isSell && '↓'}
                                            {tx.transactionType.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-2 text-gray-700 dark:text-gray-300 max-w-[150px] truncate" title={tx.insiderName}>
                                        {tx.insiderName}
                                    </td>
                                    <td className="p-2 text-gray-600 dark:text-gray-400 text-xs max-w-[120px] truncate" title={tx.insiderTitle}>
                                        {tx.insiderTitle}
                                    </td>
                                    <td className="p-2 text-right text-gray-700 dark:text-gray-300 font-mono">
                                        {tx.shares.toLocaleString()}
                                    </td>
                                    <td className="p-2 text-right text-gray-700 dark:text-gray-300 font-mono">
                                        ${tx.pricePerShare.toFixed(2)}
                                    </td>
                                    <td className="p-2 text-right font-semibold font-mono">
                                        <span className={
                                            isBuy ? 'text-green-600 dark:text-green-400' :
                                                isSell ? 'text-red-600 dark:text-red-400' :
                                                    'text-gray-700 dark:text-gray-300'
                                        }>
                                            ${(tx.totalValue / 1000).toFixed(0)}K
                                        </span>
                                    </td>
                                    <td className="p-2 text-center">
                                        <a
                                            href={tx.filingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs underline"
                                        >
                                            Form {tx.formType}
                                        </a>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {transactions.length > 20 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    Showing 20 of {transactions.length} transactions from the last 12 months
                </p>
            )}

            {transactions.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No insider transactions found in the last 12 months
                </p>
            )}
        </div>
    );
}
