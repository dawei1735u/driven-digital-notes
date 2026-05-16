import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — ShiftNotes" },
      { name: "description", content: "Sign in to access the ShiftNotes admin panel." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { reason, redirect: redirectTo } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Contextual heading based on where the user was trying to go.
  const target = redirectTo ?? "";
  const targetLabel = target.startsWith("/ipad")
    ? "iPad"
    : target.startsWith("/monitor")
      ? "Monitor"
      : target.startsWith("/admin") || target.startsWith("/changelog")
        ? "admin panel"
        : null;
  const contextHeading = targetLabel
    ? `Sign in to use the ${targetLabel}`
    : mode === "login"
      ? "Sign in"
      : "Create account";
  const contextSub = targetLabel
    ? `You need an approved account to access ${target}.`
    : mode === "login"
      ? "Access the admin panel."
      : "Sign up to manage notes.";

  function destinationAfterAuth() {
    if (redirectTo && redirectTo.startsWith("/")) return redirectTo;
    return "/admin";
  }

  useEffect(() => {
    if (reason === "not_approved") {
      setError("Your account is not approved. Please contact an administrator.");
    } else if (reason === "signin_required" && targetLabel) {
      setInfo(`Please sign in to continue to the ${targetLabel}.`);
    }
  }, [reason, targetLabel]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destinationAfterAuth() });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, redirectTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: destinationAfterAuth() });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + destinationAfterAuth(),
          },
        });
        if (error) throw error;
        setInfo("Account created. You can now sign in.");
        setMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + destinationAfterAuth(),
    });
    if (result.error) setError(result.error.message);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          ← ShiftNotes
        </Link>
        <h1 className="mt-3 text-2xl font-bold">
          {mode === "login" ? contextHeading : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login" ? contextSub : "Sign up to manage notes."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={handleGoogle}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          Continue with Google
        </button>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:underline"
        >
          {mode === "login"
            ? "No account? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}