import React from "react";
import { Slot } from "@radix-ui/react-slot";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-slate-950 text-slate-100">
      <div className="max-w-xl w-full text-center space-y-4 p-8 border border-slate-800 rounded-xl bg-slate-900/60 shadow-2xl backdrop-blur-sm">
        <Slot>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Student Academic AI
          </h1>
        </Slot>
        <p className="text-base text-slate-400">
          Predictive academic monitoring platform for universities.
        </p>
        <div className="pt-4 flex items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            System Foundation Ready
          </span>
        </div>
      </div>
    </main>
  );
}
