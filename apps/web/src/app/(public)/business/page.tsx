"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { Truck, Package, Globe, Shield, ArrowRight, CheckCircle } from "lucide-react";

export default function BusinessPage() {
  const { t } = useI18n();

  const benefits = [
    "Dedicated sourcing agent for your business",
    "Volume discounts on large orders",
    "Priority warehouse processing",
    "Custom manufacturing sourcing",
    "Consolidated multi-supplier orders",
    "Business account management",
    "Flexible payment terms",
    "Detailed cost breakdowns",
  ];

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Hero */}
          <div className="bg-[#111111] rounded-3xl p-8 md:p-16 text-white mb-12">
            <div className="max-w-2xl">
              <span className="inline-block px-4 py-1 bg-[#FF5A0A] text-white text-sm font-semibold rounded-full mb-4">
                Business & Wholesale
              </span>
              <h1 className="text-3xl md:text-5xl font-bold mb-4">
                Source Products for Your Business
              </h1>
              <p className="text-lg text-[#A8A29E] mb-8">
                Whether you run a shop, market stall, or online store, ChinaSuuq helps you source quality products from China at competitive wholesale prices.
              </p>
              <a href="https://wa.me/8615277074143?text=Hello%20ChinaSuuq%2C%20I%27m%20interested%20in%20wholesale%20sourcing%20for%20my%20business."
                 target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 px-8 py-4 bg-[#FF5A0A] hover:bg-[#E84400] text-white font-semibold rounded-2xl transition-all shadow-md">
                Contact Sales Team
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Benefits */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div>
              <h2 className="text-2xl font-bold text-[#111111] mb-6">Why Choose ChinaSuuq for Business</h2>
              <div className="space-y-3">
                {benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[#12B76A] shrink-0" />
                    <span className="text-[#667085]">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Truck, title: "Bulk Shipping", desc: "Container and LCL options" },
                { icon: Package, title: "Quality Control", desc: "Pre-shipment inspection" },
                { icon: Globe, title: "Multi-Supplier", desc: "One order, multiple factories" },
                { icon: Shield, title: "Payment Protection", desc: "Secure escrow available" },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-5">
                  <item.icon className="w-8 h-8 text-[#FF5A0A] mb-3" />
                  <h3 className="font-bold text-[#111111] mb-1 text-sm">{item.title}</h3>
                  <p className="text-xs text-[#667085]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* How it works for business */}
          <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8 md:p-12">
            <h2 className="text-2xl font-bold text-[#111111] mb-8 text-center">How Business Sourcing Works</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: "1", title: "Tell Us What You Need", desc: "Share your product requirements, quantities, and budget" },
                { step: "2", title: "We Find Suppliers", desc: "Our team sources from verified factories and wholesalers" },
                { step: "3", title: "Review & Approve", desc: "Get samples, quotes, and production timelines" },
                { step: "4", title: "Ship to Somalia", desc: "We handle purchasing, QC, and international shipping" },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-[#FF5A0A] text-white flex items-center justify-center font-bold text-lg mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-bold text-[#111111] mb-2">{item.title}</h3>
                  <p className="text-sm text-[#667085]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
