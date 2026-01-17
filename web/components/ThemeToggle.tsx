"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  // Initialize state as null to prevent hydration mismatch
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Check localStorage or system preference on mount (client-side only)
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    const shouldBeDark = stored ? stored === "dark" : prefersDark;
    setIsDark(shouldBeDark);
    
    // Apply theme to document
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !(isDark ?? true); // Default to dark if state is null
    setIsDark(newIsDark);
    
    // Apply theme to document immediately
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  // Don't render until we know the theme (prevents flash)
  if (isDark === null) {
    return (
      <button
        className="p-2 rounded-lg bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-gray-300 hover:text-white"
        title="Toggle theme"
      >
        <Sun className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors text-gray-300 hover:text-white"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
