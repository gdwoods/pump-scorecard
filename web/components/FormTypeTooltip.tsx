"use client";

import { useState } from "react";
import { getFormTypeDescription } from "@/lib/formTypeDescriptions";

interface FormTypeTooltipProps {
  formType: string;
  children: React.ReactNode;
}

export default function FormTypeTooltip({ formType, children }: FormTypeTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const description = getFormTypeDescription(formType);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className="absolute z-50 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl border border-gray-700 min-w-[300px] max-w-[400px] pointer-events-none"
          style={{
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "8px",
          }}
        >
          <div className="font-semibold text-blue-400 mb-1">{formType}</div>
          <div className="text-gray-300">{description}</div>
          {/* Tooltip arrow */}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1"
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #1f2937", // gray-800
            }}
          />
        </div>
      )}
    </div>
  );
}
