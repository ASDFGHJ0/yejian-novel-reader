import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "页间 · 本地小说阅读器",
  description: "把 TXT 小说整理成舒适、私密的阅读体验。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "页间" },
};

export const viewport: Viewport = { themeColor: "#263a32", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
