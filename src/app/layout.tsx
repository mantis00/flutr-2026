import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthNavPanel } from "@/components/platform/layout/auth-nav-panel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flutr",
  description: "Butterfly species and shipment management for institutions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <a
          href="#main-content"
          className="bg-background text-foreground focus:ring-ring sr-only rounded-md px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:ring-2"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <SessionProvider>
            {children}
            <AuthNavPanel />
            <Toaster position="bottom-right" />
            <Analytics />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
