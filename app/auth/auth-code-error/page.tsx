import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0d1117] text-[#e6edf3] font-sans">
      <h1 className="text-lg font-semibold text-[#f85149] mb-2">
        Sign-in link problem
      </h1>
      <p className="text-sm text-[#8b949e] max-w-md text-center mb-4">
        The sign-in could not be completed. Request a new magic link, confirm
        the same browser, and check the redirect URL is allowed in your
        Supabase project (Authentication → URL configuration).
      </p>
      <Link href="/auth/login" className="text-sm text-[#58a6ff] underline">
        Back to sign in
      </Link>
    </div>
  );
}
