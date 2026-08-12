"use client";

import { useState } from "react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { Search, Package, Truck, Ship, Plane, CheckCircle, Clock, MapPin, ArrowRight } from "lucide-react";

const MOCK_TRACKING = [
  { status: "Payment Confirmed", location: "Online", time: "2026-01-15 10:30", icon: CheckCircle, done: true },
  { status: "Purchased from Supplier", location: "Yiwu, China", time: "2026-01-16 14:20", icon: Package, done: true },
  { status: "Arrived at China Warehouse", location: "Yiwu Warehouse", time: "2026-01-22 09:15", icon: Package, done: true },
  { status: "Inspection Completed", location: "Yiwu Warehouse", time: "2026-01-23 11:00", icon: CheckCircle, done: true },
  { status: "Consolidated for Shipping", location: "Yiwu Warehouse", time: "2026-01-25 08:30", icon: Package, done: true },
  { status: "Shipped - Sea Freight", location: "Ningbo Port, China", time: "2026-01-28 16:00", icon: Ship, done: true },
  { status: "In Transit", location: "Indian Ocean", time: "2026-02-10 12:00", icon: Ship, done: false },
  { status: "Arrived in Somalia", location: "Mogadishu Port", time: "Estimated: Feb 25", icon: MapPin, done: false },
  { status: "Customs Processing", location: "Mogadishu", time: "Estimated: Feb 28", icon: Clock, done: false },
  { status: "Ready for Collection", location: "Mogadishu Branch", time: "Estimated: Mar 1", icon: CheckCircle, done: false },
  { status: "Delivered", location: "Your Address", time: "Estimated: Mar 3", icon: CheckCircle, done: false },
];

export default function TrackPage() {
  const { t } = useI18n();
  const [trackingId, setTrackingId] = useState("");
  const [showResults, setShowResults] = useState(false);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingId.trim()) setShowResults(true);
  };

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      {/* Hero */}
      <section className="pt-32 pb-16 px-4 bg-gradient-to-b from-white to-[#FFFCF8]">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-[#111111] mb-4">
            {t("nav.trackOrder")}
          </h1>
          <p className="text-lg text-[#667085] mb-8">
            Enter your order reference to track your shipment from China to Somalia
          </p>
          
          <form onSubmit={handleTrack} className="flex gap-3 max-w-xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#667085]" />
              <input
                type="text"
                placeholder="e.g. CS-2026-00125"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-2xl border border-[#E9E5E1] bg-white text-lg focus:outline-none focus:ring-2 focus:ring-[#FF5A0A] focus:border-transparent"
              />
            </div>
            <button type="submit" className="px-8 py-4 bg-[#FF5A0A] hover:bg-[#E84400] text-white font-semibold rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-md">
              Track
            </button>
          </form>
        </div>
      </section>

      {/* Tracking Results */}
      {showResults && (
        <section className="px-4 pb-16">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#111111]">Order {trackingId || "CS-2026-00125"}</h2>
                  <p className="text-[#667085]">Sea Freight • 3 packages • 45.2 kg</p>
                </div>
                <span className="px-4 py-2 bg-[#FFF3E9] text-[#FF5A0A] font-semibold rounded-full text-sm">
                  In Transit
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center border-t border-[#E9E5E1] pt-4">
                <div>
                  <p className="text-sm text-[#667085]">Origin</p>
                  <p className="font-semibold text-[#111111]">Yiwu, China</p>
                </div>
                <div>
                  <p className="text-sm text-[#667085]">Estimated Arrival</p>
                  <p className="font-semibold text-[#FF5A0A]">Mar 1, 2026</p>
                </div>
                <div>
                  <p className="text-sm text-[#667085]">Destination</p>
                  <p className="font-semibold text-[#111111]">Hargeisa, Somaliland</p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-6">
              <h3 className="text-lg font-bold text-[#111111] mb-6">Shipment Timeline</h3>
              <div className="space-y-0">
                {MOCK_TRACKING.map((event, i) => {
                  const Icon = event.icon;
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          event.done ? "bg-[#FF5A0A] text-white" : "bg-[#E9E5E1] text-[#667085]"
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        {i < MOCK_TRACKING.length - 1 && (
                          <div className={`w-0.5 h-12 ${event.done ? "bg-[#FF5A0A]" : "bg-[#E9E5E1]"}`} />
                        )}
                      </div>
                      <div className="pb-8">
                        <p className={`font-semibold ${event.done ? "text-[#111111]" : "text-[#667085]"}`}>
                          {event.status}
                        </p>
                        <p className="text-sm text-[#667085]">{event.location}</p>
                        <p className="text-xs text-[#A8A29E] mt-1">{event.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
