import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "InsureFlow | Intelligent insurance operations", description: "The operating system for modern insurance teams." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
