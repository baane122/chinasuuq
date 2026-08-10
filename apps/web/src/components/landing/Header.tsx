"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { Menu, X, Globe, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { key: "nav.home", href: "/" },
  { key: "nav.howItWorks", href: "/how-it-works" },
  { key: "nav.shipping", href: "/shipping" },
  { key: "nav.about", href: "/about" },
];

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-dark-900/5"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 lg:h-[72px] items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image
              src="/images/logo/chinasuuq-logo.jpg"
              alt="ChinaSuuq"
              width={140}
              height={36}
              className="h-8 lg:h-9 w-auto"
              priority
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                  scrolled
                    ? "text-dark-900/70 hover:text-dark-900 hover:bg-dark-900/5"
                    : "text-dark-900/70 hover:text-dark-900"
                }`}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Language Toggle */}
            <button
              onClick={() => setLocale(locale === "en" ? "so" : "en")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-dark-900/10 hover:border-dark-900/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === "en" ? "EN" : "SO"}
            </button>

            {/* Download App */}
            <Link
              href="#download"
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md"
            >
              <Download className="w-4 h-4" />
              {t("nav.downloadApp")}
            </Link>
          </div>

          {/* Mobile Controls */}
          <div className="flex lg:hidden items-center gap-2">
            <button
              onClick={() => setLocale(locale === "en" ? "so" : "en")}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-full border border-dark-900/10"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === "en" ? "EN" : "SO"}
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-lg hover:bg-dark-900/5 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-dark-900" />
              ) : (
                <Menu className="w-5 h-5 text-dark-900" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-white/95 backdrop-blur-md border-t border-dark-900/5 overflow-hidden"
          >
            <nav className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-sm font-medium rounded-xl text-dark-900/80 hover:text-dark-900 hover:bg-dark-900/5 transition-colors"
                >
                  {t(link.key)}
                </Link>
              ))}
              <div className="pt-3 border-t border-dark-900/5">
                <Link
                  href="#download"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full bg-brand-500 text-white text-sm font-semibold px-4 py-3 rounded-xl"
                >
                  <Download className="w-4 h-4" />
                  {t("nav.downloadApp")}
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
export default Header;
