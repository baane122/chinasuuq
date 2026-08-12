'use client';

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import {
  MessageCircle,
  Mail,
  Phone,
  MapPin,
  Globe,
  Camera,
  MessageSquare,
  Play,
} from "lucide-react";

const footerLinks = {
  company: ["about", "careers", "contact", "blog"],
  services: ["wholesale", "sourcing", "inspection", "shipping"],
  support: ["help", "faq", "tracking"],
  legal: ["terms", "privacy"],
};

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="bg-dark-900 text-white">
      {/* Main Footer */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-block mb-5">
              <Image
                src="/images/logo/chinasuuq-logo.jpg"
                alt="ChinaSuuq"
                width={160}
                height={40}
                className="h-9 w-auto brightness-0 invert"
              />
            </Link>
            <p className="text-sm text-white/40 leading-relaxed max-w-xs mb-6">
              Your trusted gateway to millions of Chinese products. We handle
              purchasing, inspection, and delivery to Somalia.
            </p>

            {/* Contact */}
            <div className="space-y-2.5 mb-6">
              <a
                href="https://wa.me/8615277074143"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm text-white/50 hover:text-brand-400 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-whatsapp" />
                +86 152 7707 4143
              </a>
              <div className="flex items-center gap-2.5 text-sm text-white/50">
                <Mail className="w-4 h-4 text-brand-500/60" />
                info@chinasuuq.com
              </div>
              <div className="flex items-center gap-2.5 text-sm text-white/50">
                <MapPin className="w-4 h-4 text-brand-500/60" />
                Hargeisa, Somaliland
              </div>
            </div>

            {/* Social */}
            <div className="flex gap-3">
              {[Globe, Camera, MessageSquare, Play].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-brand-500/20 flex items-center justify-center transition-colors"
                >
                  <Icon className="w-4 h-4 text-white/40 hover:text-white" />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {(Object.entries(footerLinks) as [string, string[]][]).map(
            ([section, links]) => (
              <div key={section}>
                <h3 className="text-sm font-semibold text-white mb-4">
                  {t(`footer.${section}`)}
                </h3>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <Link
                        href={`/${link}`}
                        className="text-sm text-white/40 hover:text-brand-400 transition-colors"
                      >
                        {t(`footer.${link}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            {t("footer.copyright")}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/30">Made for Somalia 🇸🇴</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
export default Footer;
