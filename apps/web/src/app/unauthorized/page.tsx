"use client";

import React from "react";
import Link from "next/link";
import { ShieldX, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 border border-slate-700 rounded-2xl p-8 text-center shadow-2xl">
        <div className="inline-flex p-3 bg-rose-500/20 text-rose-400 rounded-xl mb-4">
          <ShieldX className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied (403)</h1>
        <p className="text-sm text-slate-400 mb-6">
          Your account role does not have permission to view or manage this resource.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Login
        </Link>
      </div>
    </div>
  );
}
