import { redirect } from "next/navigation";

/** Home → Fast Scan (legacy Pump Scorecard lives at /pump-scorecard, unlisted). */
export default function Home() {
  redirect("/fast-scan");
}
