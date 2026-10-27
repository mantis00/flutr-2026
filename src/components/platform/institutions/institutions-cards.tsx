import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/routes";

import { Institution } from "./institutions.utils";

function getStatusVariant(status: string) {
  switch (status) {
    case "ACTIVE":
      return "default";
    case "SUSPENDED":
      return "destructive";
    default:
      return "outline";
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function InstitutionsCards({ institutions }: { institutions: Institution[] }) {
  if (institutions.length === 0) {
    return (
      <Card className="md:hidden">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">No institutions found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {institutions.map((institution) => {
        const platformHref = `${ROUTES.admin.institutionById(institution.id)}?tab=profile`;
        const location = [institution.city, institution.state_province, institution.country]
          .filter(Boolean)
          .join(", ");

        return (
          <Card key={institution.id}>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={institution.logo_url ?? ""} alt="" />
                    <AvatarFallback>{getInitials(institution.name)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="text-base font-medium break-words">{institution.name}</p>
                    <p className="text-muted-foreground text-sm break-words">{location || "—"}</p>
                  </div>
                </div>

                <Badge variant={getStatusVariant(institution.status)}>{institution.status}</Badge>
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Primary contact
                </p>
                <p className="text-sm break-all">{institution.email_address ?? "—"}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="w-full" variant="outline" asChild>
                  <Link href={ROUTES.tenant.dashboard(institution.slug)}>View as Admin</Link>
                </Button>
                <Button className="w-full" variant="outline" asChild>
                  <Link href={platformHref}>Manage Institution</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
