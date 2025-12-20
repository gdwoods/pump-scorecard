"use client";

interface LoadingSkeletonProps {
  className?: string;
}

export function CardSkeleton({ className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`p-6 border rounded-lg bg-white dark:bg-gray-800 shadow animate-pulse ${className}`}>
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
      </div>
    </div>
  );
}

export function ChartSkeleton({ className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 shadow animate-pulse ${className}`}>
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
      <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
    </div>
  );
}

export function GridSkeleton({ className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${className}`}>
      <CardSkeleton />
      <ChartSkeleton />
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse"></div>
        <div className="flex gap-2">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse"></div>
        </div>
      </div>

      {/* Input skeleton */}
      <div className="flex gap-2">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded flex-1 animate-pulse"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
      </div>

      {/* Content skeletons */}
      <CardSkeleton />
      <GridSkeleton />
      <GridSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Verdict and Droppiness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>

      {/* Score Breakdown and Fundamentals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CardSkeleton className="h-48" />
        <CardSkeleton className="h-48" />
      </div>

      {/* Criteria and News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CardSkeleton className="h-96" />
        <CardSkeleton className="h-96" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
    </div>
  );
}
