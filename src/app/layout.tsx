import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppThemeProvider } from "@/lib/ThemeContext";
import { AppShell } from "@/components/AppShell";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "加速 Kasoku",
  description: "Personal Japanese learning app",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kasoku" },
};

export const viewport: Viewport = {
  themeColor: "#6750A4",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <AppRouterCacheProvider>
          <AppThemeProvider>
            {session ? <AppShell>{children}</AppShell> : children}
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
