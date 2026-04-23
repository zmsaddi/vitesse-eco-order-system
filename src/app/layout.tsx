import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { NO_FLASH_SCRIPT } from "@/components/theme/no-flash-script";

// D-15: Cairo local font عبر next/font/local (لا Google Fonts network dependency)
const cairo = localFont({
  src: "../../public/fonts/cairo/Cairo-Variable.ttf",
  variable: "--font-cairo",
  weight: "200 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vitesse Eco — نظام إدارة الطلبات",
  description: "نظام إدارة الطلبات والعمليات لـ VITESSE ECO SAS",
  manifest: "/manifest.webmanifest",
};

// Next 16 requires themeColor under `viewport`, not `metadata`.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Phase 5.5 — no-flash theme init. Runs before hydration; sets
            <html class="dark"> (or removes it) based on stored preference
            or `prefers-color-scheme`. Keeps first paint consistent with
            the post-hydration ThemeProvider state. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className={`${cairo.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
