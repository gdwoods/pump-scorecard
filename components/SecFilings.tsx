"use client";

import { Card, CardContent } from "@/components/ui/Card";

type SecFilingsProps = {
  filings: {
    title: string;
    url: string;
  }[];
};

export default function SecFilings({ filings }: SecFilingsProps) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">📑 SEC Filings</h3>
        {filings?.length ? (
          <ul className="list-disc list-inside space-y-1">
            {filings.map((f, idx) => (
              <li key={idx} className="ml-4">
                <a
                  href={f.url}
                  className="text-blue-500"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No recent SEC filings.</p>
        )}
      </CardContent>
    </Card>
  );
}
