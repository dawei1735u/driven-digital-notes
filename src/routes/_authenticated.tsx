import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
      // Re-throw redirect; for any other error fall through (server/network).
      if (e && typeof e === "object" && "to" in (e as Record<string, unknown>)) {
        throw e;
      }
      throw e;
    }
  },
  component: () => <Outlet />,
});