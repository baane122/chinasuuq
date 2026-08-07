'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import {
  Search,
  CheckCircle,
  ShoppingCart,
  ClipboardCheck,
  Truck,
  PackageCheck,
} from "lucide-react";

const steps = [
  { icon: Search, key: "step1", descKey: "step1Desc" },
  { icon: CheckCircle, key: "step2", descKey: "step2Desc" },
  { icon: ShoppingCart, key: "step3", descKey: "step3Desc" },
  { icon: ClipboardCheck, key: "step4", descKey: "step4Desc" },
  { icon: Truck, key: "step5", descKey: "step5Desc" },
  { icon: PackageCheck, key: "step6", descKey: "step6Desc" },
];

export default function HowItWorks() {
  const { t } = useI18n();

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-white">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-dark-900 mb-3">
            {t("howItWorks.title")}
          </h2>
          <p className="text-base text-dark-900/50">
            {t("howItWorks.subtitle")}
          </p>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-4">
          {/* Connector line - desktop only */}
          <div className="hidden lg:block absolute top-10 left-[8%] right-[8%] h-px border-t-2 border-dashed border-dark-900/10" />

          {steps.map((step, i) => (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className="flex flex-col items-center text-center relative"
            >
              {/* Step Number */}
              <div className="relative z-10 w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-brand-500/20 mb-4">
                {i + 1}
              </div>

              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-warm-200/60 flex items-center justify-center mb-4">
                <step.icon className="w-7 h-7 text-brand-500" />
              </div>

              {/* Text */}
              <h3 className="text-sm font-bold text-dark-900 mb-1.5">
                {t(`howItWorks.${step.key}`)}
              </h3>
              <p className="text-xs text-dark-900/45 leading-relaxed max-w-[180px]">
                {t(`howItWorks.${step.descKey}`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
