import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { canCrossTenant, requireUser } from "@/lib/authz";
import { isGuidesUnlocked } from "@/lib/guides-access";
import { ROUTES } from "@/lib/routes";
import TenantHeader from "@/components/platform/layout/tenant/tenant-header";
import TenantSidebar from "@/components/platform/layout/tenant/tenant-sidebar";
import TenantFooter from "@/components/platform/layout/tenant/tenant-footer";
import { GuidesPasswordGate } from "@/components/tenant/guides/guides-password-gate";
import { GuestGuidesHeader } from "@/components/tenant/guides/guest-guides-header";

/**
 * Guides sit outside the (tenant) group because they are reachable two ways:
 * signed in, or with the shared guides password. Signed-in staff get the usual
 * admin shell; password-only readers get a plain one, since the sidebar links
 * would all be dead ends for them.
 */
export default async function GuidesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}) {
  const { institution: slug } = await params;
  const session = await auth();

  const user = (() => {
    try {
      return requireUser(session);
    } catch {
      return null;
    }
  })();

  if (user) {
    // The middleware matcher can't cover /guides — the route has to answer
    // without a session — so the tenant check lives here. Without it, one
    // institution's staff would get another institution's branded shell.
    const ownTenant = session?.user?.institutionSlug === slug;

    if (!ownTenant && !canCrossTenant(user)) {
      redirect(
        session?.user?.institutionSlug
          ? ROUTES.tenant.guides(session.user.institutionSlug)
          : ROUTES.unauthorized,
      );
    }

    return (
      <div className="bg-background fixed inset-0 flex flex-col overflow-hidden">
        <TenantHeader user={user} sessionUser={session?.user} />

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <TenantSidebar />
          <main id="main-content" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>

        <TenantFooter />
      </div>
    );
  }

  if (await isGuidesUnlocked()) {
    return (
      <div className="bg-background flex min-h-dvh flex-col">
        <GuestGuidesHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <TenantFooter />
      </div>
    );
  }

  return <GuidesPasswordGate />;
}
