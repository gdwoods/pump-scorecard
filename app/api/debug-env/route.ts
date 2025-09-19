// app/api/debug-env/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const env = process.env;

  const candidates = [
    "POLYGON_API_KEY",
    "NEXT_PUBLIC_POLYGON_API_KEY",
    "POLYGON_KEY",
    "POLYGON",
  ];

  const foundNames = candidates.filter((k) => !!env[k]);
  const selected =
    env.POLYGON_API_KEY ||
    env.NEXT_PUBLIC_POLYGON_API_KEY ||
    env.POLYGON_KEY ||
    env.POLYGON ||
    "";

  return NextResponse.json({
    hasPolygonKey: !!selected,
    polygonKeyLength: selected ? selected.length : 0,
    keyNameDetected: foundNames[0] ?? null,
    polygonishEnvNamesPresent: Object.keys(env).filter((k) =>
      /POLYGON|NEXT_PUBLIC_POLYGON/i.test(k)
    ),
    vercelEnv: env.VERCEL_ENV || env.NODE_ENV,
    vercelRegion: env.VERCEL_REGION || null,
    nodeVersion: process.version,
    runtime: "nodejs",
  });
}
