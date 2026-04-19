import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
