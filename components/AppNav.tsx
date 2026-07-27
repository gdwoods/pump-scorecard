"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [{ href: "/fast-scan", label: "Fast Scan" }] as const;

export default function AppNav({
  extra,
}: {
  extra?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "px-4 py-2 bg-blue-700 text-white rounded-xl hover:bg-blue-800 transition-colors"
                : "px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
            }
          >
            {link.label}
          </Link>
        );
      })}
      {extra}
    </div>
  );
}
