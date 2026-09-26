import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLA Monitoring Dashboard",
  description:
    "Monitor service availability, SLA compliance, and health-check metrics across cloud services.",
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
