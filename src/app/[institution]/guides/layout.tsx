import { auth } from "@/auth";
import { requireUser } from "@/lib/authz";
import { isGuidesUnlocked } from "@/lib/guides-access";
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
export default async function GuidesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  const user = (() => {
    try {
      return requireUser(session);
    } catch {
      return null;
    }
  })();

  if (user) {
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
