// app/api/debug-env/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // don't cache
export const revalidate = 0;

export async function GET() {
  const key = process.env.POLYGON_API_KEY;

  // Don't log the key; just safe diagnostics.
  const diagnostics = {
    hasPolygonKey: Boolean(key),
    polygonKeyLength: key?.length ?? 0,
    vercelEnv: process.env.VERCEL_ENV || null,     // "production" / "preview" / "development"
    vercelRegion: process.env.VERCEL_REGION || null,
    nodeVersion: process.version,
    runtime: "nodejs",
  };

  // Also print to function logs
  console.log("[debug-env]", diagnostics);

  return NextResponse.json(diagnostics, {
    headers: { "Cache-Control": "no-store" },
  });
}
