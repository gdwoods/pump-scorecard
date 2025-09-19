// app/api/debug-env/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const polygonKey = process.env.POLYGON_API_KEY || null;

  return NextResponse.json({
    polygonVars: {
      POLYGON_API_KEY: polygonKey,
    },
    polygonKeyLength: polygonKey ? polygonKey.trim().length : 0,
    vercelEnv: process.env.VERCEL_ENV || "unknown",
    vercelRegion: process.env.VERCEL_REGION || "unknown",
    nodeVersion: process.version,
    runtime: "nodejs",
  });
}
