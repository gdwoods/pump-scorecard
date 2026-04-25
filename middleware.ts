import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  if (hostname.includes("pump-scorecard")) {
    const targetUrl = new URL(
      `https://short-check.vercel.app${pathname + request.nextUrl.search}`
    );
    return NextResponse.redirect(targetUrl, 308);
  }

  if (hostname.includes("short-check") && pathname === "/") {
    return NextResponse.redirect(new URL("/short-check", request.url));
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|share).*)",
  ],
};
