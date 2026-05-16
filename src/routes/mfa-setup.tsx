import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/mfa-setup")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/",
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: MfaSetupPage,
});

function MfaSetupPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clean up any unverified factor so we always start fresh.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.totp ?? []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator (${new Date().toLocaleDateString()})`,
      });
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message ?? "Could not start enrollment.");
        setLoading(false);
        return;
      }
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onVerify = async (e: React.FormEvent) => {
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
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <ShieldCheck className="h-4 w-4" /> Two-factor required
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Set up 2FA</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scan this QR code with an authenticator app (Google Authenticator, 1Password,
          Authy, etc.), then enter the 6-digit code below to finish enrollment.
        </p>

        {loading && (
          <div className="mt-8 inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating secure key…
          </div>
        )}

        {!loading && qr && (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <img src={qr} alt="2FA QR code" className="mx-auto h-56 w-56" />
            </div>
            {secret && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Can't scan? Enter this key manually
                </summary>
                <code className="mt-2 block break-all rounded-md bg-muted p-2 font-mono text-xs">
                  {secret}
                </code>
              </details>
            )}

            <form onSubmit={onVerify} className="space-y-3">
              <label className="block text-sm font-medium">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
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
                disabled={busy || code.length !== 6}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify & enable 2FA
              </button>
            </form>
          </div>
        )}

        {!loading && !qr && error && (
          <div className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
