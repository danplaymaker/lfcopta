import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LFC All-Time Stats API",
  description: "Backend API for serving all-time Liverpool player statistics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
