import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PulseWatch — Uptime that works for builders", description: "A production-style serverless website and API uptime monitoring demo.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html> }
