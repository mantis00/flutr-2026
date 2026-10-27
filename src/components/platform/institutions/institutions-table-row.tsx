import { Link } from "@/components/ui/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function InstitutionsTableRow({ institution }: { institution: Institution }) {
  const platformHref = `${ROUTES.admin.institutionById(institution.id)}?tab=profile`;

  const location = [institution.city, institution.state_province, institution.country]
    .filter(Boolean)
    .join(", ");

  return (
    <TableRow>
      {/* Institution */}
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={institution.logo_url ?? ""} alt="" />
            <AvatarFallback>{getInitials(institution.name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col">
            <span className="font-medium break-words whitespace-normal">{institution.name}</span>
            <span className="text-muted-foreground text-xs break-words whitespace-normal">
              {location || "—"}
            </span>
          </div>
        </div>
      </TableCell>

      {/* Contact */}
      <TableCell className="max-w-[16rem]">
        <span className="break-all whitespace-normal">{institution.email_address ?? "—"}</span>
      </TableCell>

      {/* Theme */}
      <TableCell className="hidden xl:table-cell">
        <div className="flex items-center gap-2">
          <div className="bg-muted-foreground/40 h-3 w-3 rounded-full" />
          <span className="text-muted-foreground text-xs">Default</span>
        </div>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant={getStatusVariant(institution.status)}>{institution.status}</Badge>
      </TableCell>

      {/* Actions */}
      <TableCell className="w-[1%] whitespace-nowrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={ROUTES.tenant.dashboard(institution.slug)}>
              View<span className="sr-only"> {institution.name} as admin</span>
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={platformHref}>
              Manage<span className="sr-only"> {institution.name}</span>
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
