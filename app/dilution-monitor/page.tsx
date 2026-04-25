import DilutionMonitor from "@/components/dilution-monitor/DilutionMonitor";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";

export const dynamic = "force-dynamic";

export default async function DilutionMonitorPage() {
  if (!isSupabaseConfigured()) {
    return (
      <DilutionMonitor
        userEmail={null}
        accountsEnabled={false}
      />
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <DilutionMonitor
      userEmail={user?.email ?? null}
      accountsEnabled
    />
  );
}
