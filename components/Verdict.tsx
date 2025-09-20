"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function Verdict({ verdict }: { verdict: string }) {
  let classes = "text-green-700";
  if (verdict === "High risk") classes = "text-red-700 font-bold";
  else if (verdict === "Moderate risk") classes = "text-yellow-700 font-semibold";

  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">Final Verdict</h3>
        <p className={classes}>
          {verdict || "No verdict available"}
        </p>
      </CardContent>
    </Card>
  );
}
