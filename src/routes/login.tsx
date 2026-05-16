import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function friendlyAuthError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That email and password were not accepted. If you created this account with Google, use Continue with Google. Otherwise, use Forgot password to set a new password.";
  }
  return message;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Tasks" },
      { name: "description", content: "Sign in to access the Tasks admin panel." },
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
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

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
      const normalizedEmail = email.trim().toLowerCase();
      setEmail(normalizedEmail);
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        navigate({ to: destinationAfterAuth() });
      } else {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
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
      setError(friendlyAuthError(err));
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

  async function handleResetPassword() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("Enter your email above first, then click Reset password.");
      return;
    }
    setResetting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      setEmail(normalizedEmail);
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setInfo("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <Link to="/" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          ← Tasks
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
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "login" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          )}
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