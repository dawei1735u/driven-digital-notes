import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Loader2, LogOut } from "lucide-react";

export const Route = createFileRoute("/mfa-verify")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/",
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: MfaVerifyPage,
});

function MfaVerifyPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (cancelled) return;
      if (!verified) {
        navigate({ to: "/mfa-setup", search: { redirect: redirectTo } as never });
        return;
      }
      setFactorId(verified.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, redirectTo]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr || !challenge) throw cErr ?? new Error("Could not create challenge.");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      navigate({ to: redirectTo || "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <ShieldCheck className="h-4 w-4" /> Two-factor authentication
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Enter your 2FA code</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open your authenticator app and enter the current 6-digit code to continue.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-[0.4em] outline-none focus:border-primary"
            required
          />
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !factorId}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
