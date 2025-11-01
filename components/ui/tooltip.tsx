"use client";

import { useState, useEffect, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Detect mobile/touch devices
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Close tooltip when clicking outside (for mobile)
    if (isVisible && isMobile) {
      const handleClickOutside = (event: MouseEvent) => {
        if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
          setIsVisible(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isVisible, isMobile]);

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-1 border-t-gray-800 dark:border-t-gray-700 border-l-transparent border-r-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-gray-800 dark:border-b-gray-700 border-l-transparent border-r-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 -ml-1 border-l-gray-800 dark:border-l-gray-700 border-t-transparent border-r-transparent border-b-transparent",
    right: "right-full top-1/2 -translate-y-1/2 -mr-1 border-r-gray-800 dark:border-r-gray-700 border-t-transparent border-l-transparent border-b-transparent",
  };

  return (
    <div
      ref={tooltipRef}
      className="relative inline-block"
      onMouseEnter={() => !isMobile && setIsVisible(true)}
      onMouseLeave={() => !isMobile && setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => !isMobile && setIsVisible(false)}
      onClick={() => isMobile && setIsVisible(!isVisible)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 ${sideClasses[side]} whitespace-normal w-64 p-2 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded shadow-lg ${isMobile ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {content}
          {isMobile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsVisible(false);
              }}
              className="absolute top-1 right-1 text-gray-400 hover:text-white"
              aria-label="Close tooltip"
            >
              ×
            </button>
          )}
          <div
            className={`absolute ${arrowClasses[side]} border-4`}
          />
        </div>
      )}
    </div>
  );
}

