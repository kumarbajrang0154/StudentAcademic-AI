"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { GraduationCap, ArrowRight, Loader2 } from "lucide-react";

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === "STUDENT") {
        router.push("/student/dashboard");
      } else if (user.role === "FACULTY" || user.role === "MENTOR") {
        router.push("/faculty/dashboard");
      } else {
        router.push("/admin/dashboard");
      }
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-950 text-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-950 text-slate-100">
      <div className="max-w-xl w-full text-center space-y-6 p-8 border border-slate-800 rounded-2xl bg-slate-900/60 shadow-2xl backdrop-blur-sm">
        <div className="inline-flex p-3 bg-indigo-600/20 text-indigo-400 rounded-xl">
          <GraduationCap className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Student Academic AI
        </h1>
        <p className="text-base text-slate-400">
          Predictive academic monitoring & early intervention platform for universities.
        </p>
        <div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-indigo-600/20"
          >
            Go to Portal Login <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
