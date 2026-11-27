"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { toast } from "sonner";
import { X } from "lucide-react";
import { logger } from "@/lib/logger";
import { ROUTES } from "@/lib/routes";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

type PublicInstitutionSummary = {
  facility_image_url: string | null;
};

type PublicInstitutionsResponse = {
  institutions?: PublicInstitutionSummary[];
};

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBackgroundImage() {
      try {
        const response = await fetch("/api/public/institutions", {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PublicInstitutionsResponse;
        const institutions = payload?.institutions ?? [];
        const firstWithImage = institutions.find((inst) => Boolean(inst.facility_image_url));

        setBackgroundImageUrl(firstWithImage?.facility_image_url ?? null);
      } catch {
        // Keep default background when the image cannot be loaded.
      }
    }

    void loadBackgroundImage();

    return () => {
      controller.abort();
    };
  }, []);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true);
    setAuthError(null);

    try {
      await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      // NextAuth v5 beta does not reliably reflect auth failure in the signIn return
      // value. Verify by checking whether a session was actually created.
      const sessionResponse = await fetch("/api/auth/session");
      const session = await sessionResponse.json();
      const role = session?.user?.role;

      if (!role) {
        setAuthError("Incorrect email or password.");
        return;
      }

      toast.success("Logged in successfully");

      if (role === "SUPERUSER") {
        // Redirect superusers to the platform dashboard
        router.push(ROUTES.admin.dashboard);
      } else if (session?.user?.institutionSlug) {
        // Redirect to institution dashboard using slug (public tenant segment)
        router.push(ROUTES.tenant.dashboard(session.user.institutionSlug));
      } else {
        // Fallback if institution slug is missing
        router.push("/");
      }
    } catch (error) {
      setAuthError("An error occurred. Please try again.");
      logger.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {backgroundImageUrl ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        />
      ) : (
        <div aria-hidden="true" className="bg-muted absolute inset-0" />
      )}

      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle asChild>
              <h1>Institution Login</h1>
            </CardTitle>
            <CardDescription>Enter your credentials to access your institution</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {authError && (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400"
                  >
                    <span>{authError}</span>
                    <button
                      type="button"
                      aria-label="Dismiss error"
                      onClick={() => setAuthError(null)}
                      className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="you@example.com"
                          disabled={isLoading}
                          autoComplete="email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••"
                          disabled={isLoading}
                          autoComplete="current-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Logging in..." : "Login"}
                </Button>
              </form>
            </Form>

            <div className="text-muted-foreground mt-4 text-center text-sm">
              <p>Demo credentials available in documentation</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
