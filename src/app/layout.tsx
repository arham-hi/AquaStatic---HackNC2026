import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Providers } from "@/components/shell/providers";
import { AppShell } from "@/components/shell/app-shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Aqua Static — Your campus. In real time.", template: "%s · Aqua Static" },
  description: "A live, AI-powered map of campus life at UNC-Chapel Hill: events, alerts, transit, and students helping students.",
  applicationName: "Aqua Static",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b1426" }, { color: "#f3f7fb" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const theme = jar.get("aqua-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers initialTheme={theme}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
