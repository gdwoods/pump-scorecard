"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type CollapsibleCardProps = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="rounded-2xl shadow-sm border dark:border-gray-700 bg-white dark:bg-gray-900">
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {open ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500" />
        )}
      </div>

      {open && (
        <CardContent className="p-4 border-t dark:border-gray-700">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
