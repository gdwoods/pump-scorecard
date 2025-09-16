// components/RiskPill.tsx
import React from 'react';

export default function RiskPill({ score }: { score: number }) {
  let classes = 'bg-green-200 text-green-800';
  if (score >= 70) classes = 'bg-red-200 text-red-800';
  else if (score >= 40) classes = 'bg-yellow-200 text-yellow-800';

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${classes}`}>
      {score}%
    </span>
  );
}