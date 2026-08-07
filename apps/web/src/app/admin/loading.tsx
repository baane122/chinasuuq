"use client";

import { Loader2 } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        <p className="text-sm text-dark-400">Loading admin panel...</p>
      </div>
    </div>
  );
}
