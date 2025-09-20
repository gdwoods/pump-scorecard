"use client";

import { Card, CardContent } from "@/components/ui/card";

export default function Summary({ text }: { text: string }) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">📝 Summary</h3>
        <p className="text-sm text-gray-700">{text || "No summary available."}</p>
      </CardContent>
    </Card>
  );
}
