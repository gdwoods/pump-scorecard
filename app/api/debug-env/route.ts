import { NextResponse } from "next/server";

export async function GET() {
  // Show any env vars that contain "POLYGON"
  const polygonVars = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.includes("POLYGON"))
  );

  return NextResponse.json({
    polygonVars,
    polygonKeyLength: process.env.POLYGON_API_KEY?.length || 0,
    vercelEnv: process.env.VERCEL_ENV || "unknown",
    nodeVersion: process.version,
    runtime: "nodejs",
  });
}
