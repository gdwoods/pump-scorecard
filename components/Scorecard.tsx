"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";

type ScorecardProps = {
  scores: Record<string, number>;
};

export default function Scorecard({ scores }: ScorecardProps) {
if (!scores) return null; // Prevents crashing

const signalEntries = Object.entries(scores);

  const average =
    signalEntries.reduce((sum, [, score]) => sum + score, 0) /
    signalEntries.length;

  return (
    <div className="grid gap-4">
      {/* Total Pump Score Summary */}
      <Card className="bg-primary text-primary-foreground shadow-md p-4">
        <CardContent className="p-0">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-lg">Total Pump Score</span>
            <span className="text-sm">{Math.round(average * 100)}%</span>
          </div>
          <Progress value={average * 100} className="h-4 rounded bg-white/20" />
        </CardContent>
      </Card>

      {/* Individual Signal Scores */}
      {signalEntries.map(([signal, score]) => (
        <Card key={signal} className="bg-muted p-4">
          <CardContent className="p-0">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold">{signal}</span>
              <span className="text-sm text-muted-foreground">
                {Math.round(score * 100)}%
              </span>
            </div>
            <Progress value={score * 100} className="h-3 rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
