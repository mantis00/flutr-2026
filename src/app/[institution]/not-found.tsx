import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { BackButton } from "@/components/shared/back-button";
import { ROUTES } from "@/lib/routes";

/**
 * 404 for any page under `/[institution]`. A hidden public site (`stats_active = false`)
 * also lands here, and its public nav is not rendered, so staff get a sign-in link.
 */
export default function InstitutionNotFound() {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center"
    >
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="sr-only">Error 404: </span>
        Page not found
      </h1>
      <p className="text-muted-foreground mt-3 max-w-sm text-balance">
        This page may have moved, no longer exists, or isn&apos;t available to the public right now.
        Institution staff can sign in to manage their account.
      </p>

      <nav
        aria-label="Error page navigation"
        className="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <BackButton />
        <Button asChild>
          <Link href="/">Browse butterfly houses</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={ROUTES.login}>Staff sign in</Link>
        </Button>
      </nav>
    </main>
  );
}
