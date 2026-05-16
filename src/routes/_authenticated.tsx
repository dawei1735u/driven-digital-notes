import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccessStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
          reason: "signin_required",
        } as never,
      });
    }
    try {
      const status = await getMyAccessStatus();
      if (!status.allowed) {
        await supabase.auth.signOut();
        throw redirect({
          to: "/login",
          search: {
            reason: "not_approved",
            redirect: location.href,
          } as never,
        });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      // Server/network error — fall through to MFA check.
    }

    // Enforce TOTP 2FA for every signed-in user.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerifiedTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
      throw redirect({
        to: hasVerifiedTotp ? "/mfa-verify" : "/mfa-setup",
        search: { redirect: location.href } as never,
      });
    }
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal1") {
      // No factor enrolled yet — force enrollment.
      throw redirect({
        to: "/mfa-setup",
        search: { redirect: location.href } as never,
      });
    }
  },
  component: () => <Outlet />,
});
