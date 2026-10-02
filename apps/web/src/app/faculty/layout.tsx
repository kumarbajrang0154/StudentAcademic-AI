import React from "react";
import { FacultyShell } from "@/components/faculty/faculty-shell";

export const metadata = {
  title: "Faculty & Mentor Portal | Student Academic AI",
  description: "Academic tracking, batch marks entry, and AI voice attendance for faculty.",
};

export default function FacultyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FacultyShell>{children}</FacultyShell>;
}
