// app/api/debug-env/route.ts
import { NextResponse } from "next/server";
import {
  ASKEDGAR_ENV_KEYS,
  getAskEdgarApiKeyFromEnv,
} from "@/lib/topGainers";

export async function GET() {
  const polygonKey = process.env.POLYGON_API_KEY || null;
  const googleVisionKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || null;
  const askEdgarEffective = getAskEdgarApiKeyFromEnv();
  // Static property access so Next/Vercel bundle exposes these (see getAskEdgarApiKeyFromEnv).
  const askEdgarPresence: Record<string, boolean> = {
    ASKEDGAR_API_KEY: Boolean(process.env.ASKEDGAR_API_KEY?.trim()),
    ASK_EDGAR_API_KEY: Boolean(process.env.ASK_EDGAR_API_KEY?.trim()),
    ASKEDGAR_KEY: Boolean(process.env.ASKEDGAR_KEY?.trim()),
    ASK_EDGAR_KEY: Boolean(process.env.ASK_EDGAR_KEY?.trim()),
  };

  return NextResponse.json({
    polygonVars: {
      POLYGON_API_KEY: polygonKey,
    },
    polygonKeyLength: polygonKey ? polygonKey.trim().length : 0,
    googleVisionVars: {
      GOOGLE_CLOUD_VISION_API_KEY: googleVisionKey ? `${googleVisionKey.substring(0, 10)}...` : null,
    },
    googleVisionKeyLength: googleVisionKey ? googleVisionKey.trim().length : 0,
    googleVisionKeySet: !!googleVisionKey,
    askEdgar: {
      effectiveKeyLength: askEdgarEffective.length,
      effectiveKeySet: askEdgarEffective.length > 0,
      whichVarsHaveValue: askEdgarPresence,
      checkedNames: [...ASKEDGAR_ENV_KEYS],
    },
    vercelEnv: process.env.VERCEL_ENV || "unknown",
    vercelRegion: process.env.VERCEL_REGION || "unknown",
    nodeVersion: process.version,
    runtime: "nodejs",
  });
}
