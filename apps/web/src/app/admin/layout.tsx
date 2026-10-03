import React from "react";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = {
  title: "HOD & Institutional Admin Portal | Student Academic AI",
  description: "Departmental monitoring, risk governance, tier-1 escalation management, and curriculum compliance.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
