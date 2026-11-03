"use client";

import { useActionState } from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/components/ui/link";
import { ROUTES } from "@/lib/routes";
import { unlockGuides, type UnlockState } from "@/app/[institution]/guides/actions";

const INITIAL: UnlockState = { error: null };

export function GuidesPasswordGate() {
  const [state, formAction, pending] = useActionState(unlockGuides, INITIAL);

  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BookOpen className="text-primary size-7" aria-hidden="true" />
          {/* CardTitle renders a div, and this is the whole page for a locked-out
              reader, so the title is written out as a real h1 instead. */}
          <h1 data-slot="card-title" className="leading-none font-semibold">
            Staff guides
          </h1>
          <CardDescription>
            These guides explain how to run Flutr. Sign in, or enter the shared guides password if
            you don&apos;t have an account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="guides-password">Guides password</Label>
              <Input
                id="guides-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? "guides-password-error" : undefined}
              />
              {state.error && (
                <p id="guides-password-error" role="alert" className="text-destructive text-sm">
                  {state.error}
                </p>
              )}
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "View the guides"}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-sm">
            Have an account?{" "}
            <Link href={ROUTES.login} className="text-primary underline">
              Sign in instead
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
