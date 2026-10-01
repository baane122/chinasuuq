'use client';

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import {
  MessageCircle,
  Mail,
  MapPin,
} from "lucide-react";
import { waLink } from "@/lib/whatsapp";

/**
 * Only routes that actually exist — every footer link used to resolve
 * (careers/blog/wholesale/… all 404'd to the unstyled Next default).
 * `href` beats `tKey` when a link needs a label that isn't in the i18n dict.
 */
const footerColumns: { section: string; links: { tKey: string; href: string }[] }[] = [
  {
    section: "company",
    links: [
      { tKey: "footer.about", href: "/about" },
      { tKey: "nav.business", href: "/business" },
      { tKey: "nav.getQuote", href: "/quote" },
    ],
  },
  {
    section: "services",
    links: [
      { tKey: "nav.shipping", href: "/shipping" },
      { tKey: "nav.howItWorks", href: "/how-it-works" },
    ],
  },
  {
    section: "support",
    links: [
      { tKey: "footer.tracking", href: "/track" },
      { tKey: "footer.help", href: "/help" },
      { tKey: "nav.getQuote", href: "/quote" },
    ],
  },
];

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
            <p className="text-sm text-white/55 leading-relaxed max-w-xs mb-6">
              Your trusted gateway to millions of Chinese products. We handle
              purchasing, inspection, and delivery to Somalia.
            </p>

            {/* Contact */}
            <div className="space-y-2.5 mb-6">
              <a
                href={waLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 text-sm text-white/55 hover:text-brand-400 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-whatsapp" />
                +86 152 7707 4143
              </a>
              <a
                href="mailto:info@chinasuuq.com"
                className="flex items-center gap-2.5 text-sm text-white/55 hover:text-brand-400 transition-colors"
              >
                <Mail className="w-4 h-4 text-brand-500/60" />
                info@chinasuuq.com
              </a>
              <div className="flex items-center gap-2.5 text-sm text-white/55">
                <MapPin className="w-4 h-4 text-brand-500/60" />
                Hargeisa, Somaliland
              </div>
            </div>
          </div>

          {/* Link Columns */}
          {footerColumns.map(({ section, links }) => (
            <div key={section}>
              <h3 className="text-sm font-semibold text-white mb-4">
                {t(`footer.${section}`)}
              </h3>
              <ul className="space-y-2.5">
                {links.map(({ tKey, href }) => (
                  <li key={`${section}-${href}`}>
                    <Link
                      href={href}
                      className="text-sm text-white/55 hover:text-brand-400 transition-colors"
                    >
                      {t(tKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/45">
            {t("footer.copyright")}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/45">Made for Somalia 🇸🇴</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
export default Footer;
