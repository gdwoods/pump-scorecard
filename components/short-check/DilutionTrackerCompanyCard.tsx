"use client";

import { Card, CardContent } from "@/components/ui/card";

type DtProfileView = {
  companyName: string | null;
  description: string | null;
  industry: string | null;
  sector: string | null;
  exchange: string | null;
  country: string | null;
  website: string | null;
  isDelisted: boolean;
  inDtCoverage: boolean;
};

type DtDevelopmentView = {
  id: string;
  publishedAt: string;
  text: string;
};

export type DilutionTrackerCompanyData = {
  profile?: DtProfileView | null;
  developments?: DtDevelopmentView[] | null;
};

const DESCRIPTION_CHARS = 280;
const DEVELOPMENT_CHARS = 220;
const DEVELOPMENTS_SHOWN = 3;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function DilutionTrackerCompanyCard({
  data,
}: {
  data?: DilutionTrackerCompanyData | null;
}) {
  const profile = data?.profile ?? null;
  const developments = (data?.developments ?? []).slice(0, DEVELOPMENTS_SHOWN);
  if (!profile && developments.length === 0) return null;

  const facts = [profile?.sector, profile?.industry, profile?.exchange, profile?.country]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="mt-3">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            DilutionTracker · Company
          </p>
          {profile?.isDelisted && (
            <span className="text-xs font-semibold text-red-700 dark:text-red-400">Delisted</span>
          )}
        </div>

        {profile && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {profile.companyName ?? "Company name unavailable"}
            </p>
            {facts && <p className="text-xs text-gray-600 dark:text-gray-400">{facts}</p>}
            {profile.description && (
              <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                {clip(profile.description, DESCRIPTION_CHARS)}
              </p>
            )}
          </div>
        )}

        {developments.length > 0 && (
          <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Latest DilutionTracker articles
            </p>
            <ul className="space-y-2">
              {developments.map((d) => (
                <li key={d.id} className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    {formatDate(d.publishedAt)}
                  </span>{" "}
                  {clip(d.text, DEVELOPMENT_CHARS)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
