'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import {
  Globe,
  Wallet,
  ShieldCheck,
  Plane,
  Truck,
  BadgePercent,
} from "lucide-react";

const features = [
  { icon: Globe, key: "Direct Access", desc: "50M+ products from 1688, Taobao, YiwuGo" },
  { icon: Wallet, key: "Local Payments", desc: "EVC Plus, Zaad, Sahal & bank transfer" },
  { icon: ShieldCheck, key: "Quality Check", desc: "Inspection at our China warehouse" },
  { icon: Plane, key: "Air & Sea Cargo", desc: "7-day air or 30-day sea freight" },
  { icon: Truck, key: "Door Delivery", desc: "Home & office delivery across Somalia" },
  { icon: BadgePercent, key: "Best Prices", desc: "Factory-direct with transparent fees" },
];

export default function TrustBar() {
  return (
    <section className="bg-dark-900 px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Why Somali Shoppers Choose ChinaSuuq
          </h2>
          <p className="text-sm text-white/40">
            End-to-end sourcing, inspection, and delivery
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          {features.map((feat, i) => (
            <motion.div
              key={feat.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="flex flex-col items-center text-center group"
            >
              <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center mb-4 group-hover:bg-brand-500/25 transition-colors">
                <feat.icon className="w-6 h-6 text-brand-500" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                {feat.key}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">
                {feat.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
