"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { Plane, Ship, Clock, Weight, Package, MapPin } from "lucide-react";

export default function ShippingPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-5xl font-bold text-[#111111] mb-4">Shipping & Delivery</h1>
            <p className="text-lg text-[#667085] max-w-2xl mx-auto">
              Reliable air and sea freight from China to Somalia
            </p>
          </div>

          {/* Comparison */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#FF5A0A] flex items-center justify-center">
                  <Plane className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-[#111111]">Air Freight</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#FF5A0A]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Transit Time</p>
                    <p className="text-sm text-[#667085]">7-14 business days</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Weight className="w-5 h-5 text-[#FF5A0A]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Best For</p>
                    <p className="text-sm text-[#667085]">Small, urgent, high-value items</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[#FF5A0A]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Charging</p>
                    <p className="text-sm text-[#667085]">By actual or volumetric weight</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#2970FF] flex items-center justify-center">
                  <Ship className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-[#111111]">Sea Freight</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#2970FF]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Transit Time</p>
                    <p className="text-sm text-[#667085]">25-40 business days</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Weight className="w-5 h-5 text-[#2970FF]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Best For</p>
                    <p className="text-sm text-[#667085]">Heavy, bulk, non-urgent orders</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[#2970FF]" />
                  <div>
                    <p className="font-semibold text-[#111111]">Charging</p>
                    <p className="text-sm text-[#667085]">By CBM or weight, whichever greater</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Process */}
          <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8 md:p-12">
            <h2 className="text-2xl font-bold text-[#111111] mb-6">Shipping Process</h2>
            <div className="space-y-6">
              {[
                { step: "1", title: "Order Confirmed", desc: "Payment verified and order confirmed" },
                { step: "2", title: "Purchased & Received", desc: "Supplier ships to our China warehouse" },
                { step: "3", title: "Inspected & Consolidated", desc: "Quality check and package consolidation" },
                { step: "4", title: "Shipped from China", desc: "Loaded and departed from port/airport" },
                { step: "5", title: "In Transit", desc: "On the way to Somalia" },
                { step: "6", title: "Arrived Somalia", desc: "Customs clearance and local processing" },
                { step: "7", title: "Ready for Collection", desc: "Pick up at branch or receive delivery" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#FF5A0A] text-white flex items-center justify-center font-bold shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-semibold text-[#111111]">{item.title}</p>
                    <p className="text-sm text-[#667085]">{item.desc}</p>
                  </div>
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
