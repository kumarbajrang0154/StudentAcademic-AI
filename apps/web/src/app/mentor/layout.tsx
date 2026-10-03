import React from "react";

export const metadata = {
  title: "Mentor Portal | Student Academic AI",
  description: "Mentor dashboard — monitor mentee academic health, schedule interventions, and manage escalations.",
};

// The MentorShell is rendered directly inside each page component
// (not a shared layout) to allow per-page guard logic and query providers.
export default function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
