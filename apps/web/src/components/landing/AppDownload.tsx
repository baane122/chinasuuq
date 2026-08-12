'use client';

import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import { Smartphone, QrCode } from "lucide-react";

export default function AppDownload() {
  const { t } = useI18n();

  return (
    <section id="download" className="px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="relative bg-brand-500 rounded-[2rem] overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] rounded-full bg-brand-600/50 blur-3xl" />
          </div>

          <div className="relative grid lg:grid-cols-2 gap-8 items-center px-8 sm:px-12 lg:px-16 py-14 lg:py-16">
            {/* Left content */}
            <div className="text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                {t("app.title")}
              </h2>
              <p className="text-base text-white/70 mb-8 max-w-md mx-auto lg:mx-0">
                {t("app.subtitle")}
              </p>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-8">
                {/* Google Play */}
                <a href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%20want%20to%20download%20the%20app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 bg-dark-900 hover:bg-dark-800 text-white px-5 py-3 rounded-xl transition-all duration-200 active:scale-[0.97]">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                    <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.6 3 21.09 3 20.5ZM16.81 15.12L6.05 21.34L14.54 12.85L16.81 15.12ZM20.16 10.81C20.5 11.08 20.75 11.5 20.75 12C20.75 12.5 20.5 12.92 20.16 13.19L17.89 14.5L15.39 12L17.89 9.5L20.16 10.81ZM6.05 2.66L16.81 8.88L14.54 11.15L6.05 2.66Z" fill="currentColor"/>
                  </svg>
                  <div className="text-left">
                    <div className="text-[10px] text-white/50 leading-tight">GET IT ON</div>
                    <div className="text-sm font-semibold leading-tight">Google Play</div>
                  </div>
                </a>

                {/* App Store */}
                <a href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%20want%20to%20download%20the%20app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 bg-dark-900 hover:bg-dark-800 text-white px-5 py-3 rounded-xl transition-all duration-200 active:scale-[0.97]">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 16.56 2.93 11.3 4.7 7.72C5.57 5.94 7.36 4.86 9.28 4.84C10.56 4.81 11.78 5.7 12.57 5.7C13.36 5.7 14.85 4.62 16.41 4.8C17.08 4.83 18.88 5.07 20.04 6.78C19.91 6.86 17.72 8.1 17.75 10.76C17.78 13.9 20.57 14.97 20.6 14.98C20.57 15.06 20.17 16.46 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                  </svg>
                  <div className="text-left">
                    <div className="text-[10px] text-white/50 leading-tight">Download on the</div>
                    <div className="text-sm font-semibold leading-tight">App Store</div>
                  </div>
                </a>
              </div>

              <p className="text-xs text-white/40 font-medium">
                {t("app.comingSoon")}
              </p>
            </div>

            {/* Right - Phone mockups with real assets */}
            <div className="flex justify-center items-end gap-4">
              {/* Phone 1 - Onboarding slide */}
              <motion.div
                initial={{ opacity: 0, y: 40, rotate: -6 }}
                whileInView={{ opacity: 1, y: 0, rotate: -6 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="relative w-[180px] sm:w-[200px]"
              >
                <div className="bg-dark-900 rounded-[2rem] p-2 shadow-2xl">
                  <div className="bg-gradient-to-b from-brand-400/30 to-warm-200 rounded-[1.6rem] aspect-[9/19] flex items-center justify-center overflow-hidden">
                    <img
                      src="/images/onboarding/slide1.png"
                      alt="Shop China"
                      width={600}
                      height={1267}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Phone 2 - Onboarding slide */}
              <motion.div
                initial={{ opacity: 0, y: 40, rotate: 6 }}
                whileInView={{ opacity: 1, y: 0, rotate: 6 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.25 }}
                className="relative w-[180px] sm:w-[200px]"
              >
                <div className="bg-dark-900 rounded-[2rem] p-2 shadow-2xl">
                  <div className="bg-gradient-to-b from-brand-500/20 to-warm-200 rounded-[1.6rem] aspect-[9/19] flex items-center justify-center overflow-hidden">
                    <img
                      src="/images/onboarding/slide2.png"
                      alt="Browse and Shop"
                      width={600}
                      height={1267}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
