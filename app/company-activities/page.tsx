"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CompanyActivity {
  id: string;
  ticker?: string;
  activity_type?: string;
  description?: string;
  date?: string;
  created_at?: string;
  [key: string]: any; // Allow for additional fields
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CompanyActivitiesPage() {
  const [activities, setActivities] = useState<CompanyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [tickerFilter, setTickerFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchActivities = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
      });

      if (tickerFilter.trim()) {
        params.append("ticker", tickerFilter.trim().toUpperCase());
      }

      const response = await fetch(`/api/company-activities?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch activities");
      }

      const result = await response.json();
      setActivities(result.data || []);
      setPagination(result.pagination || pagination);
    } catch (err) {
      console.error("Error fetching activities:", err);
      setError(err instanceof Error ? err.message : "Failed to load activities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [pagination.page, sortBy, sortOrder, tickerFilter]);

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Get all unique column names from activities
  const getColumns = (): string[] => {
    if (activities.length === 0) return [];
    const allKeys = new Set<string>();
    activities.forEach((activity) => {
      Object.keys(activity).forEach((key) => allKeys.add(key));
    });
    return Array.from(allKeys).sort();
  };

  const columns = getColumns();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-600">
          <img src="/logo.png" alt="Pump Scorecard Logo" className="h-8 w-8" />
          Company Activities
        </h1>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          ← Back to Home
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="ticker-filter" className="font-medium">
            Filter by Ticker:
          </label>
          <input
            id="ticker-filter"
            type="text"
            value={tickerFilter}
            onChange={(e) => {
              setTickerFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            placeholder="e.g., AAPL"
            className="border px-3 py-2 rounded w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-by" className="font-medium">
            Sort by:
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="border px-3 py-2 rounded"
          >
            {columns.map((col) => (
              <option key={col} value={col}>
                {col.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-3 py-2 border rounded hover:bg-gray-100"
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading activities...</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-2">
                        {col.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        {sortBy === col && (
                          <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                    >
                      No activities found
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-gray-50">
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="border border-gray-300 px-4 py-2"
                        >
                          {activity[col] !== null && activity[col] !== undefined
                            ? typeof activity[col] === "object"
                              ? JSON.stringify(activity[col])
                              : String(activity[col])
                            : "-"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total} activities
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
