"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function KPICard({
  title, value, change, changeLabel, icon: Icon, color = "brand", delay = 0,
}: {
  title: string; value: string | number; change?: number; changeLabel?: string; icon: LucideIcon; color?: "brand" | "sky" | "emerald" | "amber" | "rose" | "violet"; delay?: number;
}) {
  const colorMap: Record<string, string> = {
    brand: "from-brand-500 to-brand-600",
    sky: "from-sky-500 to-blue-600",
    emerald: "from-emerald-500 to-green-600",
    amber: "from-amber-500 to-orange-600",
    rose: "from-rose-500 to-pink-600",
    violet: "from-violet-500 to-purple-600",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05, duration: 0.35 }}
      className="rounded-2xl border border-dark-900/5 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-dark-900/50">{title}</p>
          <p className="mt-2 text-2xl font-bold text-dark-900">{value}</p>
          {change !== undefined && (
            <div className="mt-1 flex items-center gap-1">
              <span className={cn("text-xs font-semibold", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {change >= 0 ? "+" : ""}{change}%
              </span>
              {changeLabel && <span className="text-xs text-dark-900/40">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", colorMap[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}
