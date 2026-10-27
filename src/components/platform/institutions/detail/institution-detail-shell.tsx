"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmDiscardUnsavedChanges } from "@/hooks/use-unsaved-changes-warning";
import InstitutionProfileTab from "./institution-profile-tab";
import InstitutionUsersTab from "./institution-users-tab";
import InstitutionDataTab from "./institution-data-tab";

export interface InstitutionDetail {
  id: number;
  name: string;
  slug: string;
  main_header: string | null;
  description: string | null;
  street_address: string;
  extended_address: string | null;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  time_zone: string | null;
  email_address: string | null;
  phone_number: string | null;
  website_url: string | null;
  volunteer_url: string | null;
  donation_url: string | null;
  logo_url: string | null;
  facility_image_url: string | null;
  social_links: Record<string, string> | null;
  theme_colors: string[] | null;
  stats_active: boolean;
  iabes_member: boolean;
}

export interface InstitutionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export type InstitutionDetailMode = "platform" | "tenant";

type InstitutionDetailTab = "profile" | "users" | "data";

interface Props {
  institution: InstitutionDetail;
  users: InstitutionUser[];
  initialTab: InstitutionDetailTab;
  /** @default "platform" */
  mode?: InstitutionDetailMode;
  /** When true, all editing controls are hidden (read-only view for EMPLOYEE). */
  readOnly?: boolean;
}

export default function InstitutionDetailShell({
  institution,
  users,
  initialTab,
  mode = "platform",
  readOnly = false,
}: Props) {
  const isTenant = mode === "tenant";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentInstitution, setCurrentInstitution] = useState(institution);
  const [isDeletingInstitution, setIsDeletingInstitution] = useState(false);
  const [activeTab, setActiveTab] = useState<InstitutionDetailTab>(initialTab);
  const [isProfileDirty, setIsProfileDirty] = useState(false);

  useEffect(() => {
    setCurrentInstitution(institution);
  }, [institution]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  function handleTabChange(value: string) {
    const nextTab = value as InstitutionDetailTab;

    // Leaving the profile tab unmounts its form, so confirm first. This sits
    // on the change handler rather than the trigger's click so arrow-key tab
    // switching is covered too.
    if (nextTab !== activeTab && isProfileDirty && !confirmDiscardUnsavedChanges()) {
      return;
    }

    setActiveTab(nextTab);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleDeleteInstitution() {
    setIsDeletingInstitution(true);

    const res = await fetch(`/api/platform/institutions/${currentInstitution.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success("Institution deleted.");
      router.push(ROUTES.admin.institutions);
      return;
    }

    const data = await res.json().catch(() => ({}));
    toast.error(data?.message ?? "Failed to delete institution.");
    setIsDeletingInstitution(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            {!isTenant && (
              <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                <Link href={ROUTES.admin.institutions}>
                  <ArrowLeft className="mr-1 size-4" aria-hidden="true" />
                  Institutions
                </Link>
              </Button>
            )}
            <h1 className="text-2xl font-bold wrap-break-word whitespace-normal">
              {currentInstitution.name}
            </h1>
          </div>
        </div>
        {!isTenant && (
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href={ROUTES.tenant.dashboard(currentInstitution.slug)}>View as Admin</Link>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  Delete Institution
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete institution?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove {currentInstitution.name} and all tenant-scoped
                    data tied to it. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeletingInstitution}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={isDeletingInstitution}
                    onClick={handleDeleteInstitution}
                  >
                    {isDeletingInstitution ? "Deleting…" : "Delete institution"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList
          aria-label="Institution settings"
          className={cn(
            "grid w-full sm:inline-flex sm:w-fit",
            isTenant && readOnly ? "grid-cols-1" : "grid-cols-3",
          )}
        >
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {!(isTenant && readOnly) && <TabsTrigger value="users">Users</TabsTrigger>}
          {!(isTenant && readOnly) && <TabsTrigger value="data">Data</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <InstitutionProfileTab
            institution={currentInstitution}
            onSaved={setCurrentInstitution}
            onDirtyChange={setIsProfileDirty}
            mode={mode}
            readOnly={readOnly}
          />
        </TabsContent>

        {!(isTenant && readOnly) && (
          <TabsContent value="users">
            <InstitutionUsersTab
              institution={currentInstitution}
              initialUsers={users}
              readOnly={readOnly}
            />
          </TabsContent>
        )}

        {!(isTenant && readOnly) && (
          <TabsContent value="data">
            <InstitutionDataTab
              institutionId={currentInstitution.id}
              mode={mode}
              tenantSlug={isTenant ? currentInstitution.slug : undefined}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
