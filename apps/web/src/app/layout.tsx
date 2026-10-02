import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Student Academic AI",
  description: "Predictive academic monitoring platform for universities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-canvas text-slate-900">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
