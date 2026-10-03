import React, { Suspense } from "react";
import { HodShell } from "@/components/hod/hod-shell";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Department HOD Portal | Student Academic AI",
  description: "Academic monitoring, student progress dossiers, faculty reports, and tier-1 escalations.",
};

export default function HodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      }
    >
      <HodShell>{children}</HodShell>
    </Suspense>
  );
}
