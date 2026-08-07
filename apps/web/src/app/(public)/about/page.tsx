"use client";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import WhatsAppFAB from "@/components/landing/WhatsAppFAB";
import { useI18n } from "@/lib/i18n";
import { Target, Users, Globe, Shield, Heart, Award } from "lucide-react";

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#FFFCF8]">
      <Header />
      
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-3xl md:text-5xl font-bold text-[#111111] mb-4">
              About ChinaSuuq
            </h1>
            <p className="text-lg text-[#667085] max-w-2xl mx-auto">
              Bridging China and Somalia through technology, trust, and seamless commerce
            </p>
          </div>

          {/* Mission */}
          <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8 md:p-12 mb-12">
            <h2 className="text-2xl font-bold text-[#111111] mb-4">Our Mission</h2>
            <p className="text-[#667085] leading-relaxed text-lg">
              ChinaSuuq exists to make Chinese products accessible to every Somali customer. We handle the complexity of international sourcing, purchasing, quality inspection, and logistics so you can focus on what matters — finding the right products at the right price.
            </p>
          </div>

          {/* Values */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {[
              { icon: Shield, title: "Trust & Transparency", desc: "Every transaction is clear. Real prices, real photos, real tracking." },
              { icon: Target, title: "Quality First", desc: "Mandatory inspection at our China warehouse before any shipment leaves." },
              { icon: Globe, title: "Global Access", desc: "Connecting Somali customers to 1688, Taobao, and Yiwu markets." },
              { icon: Users, title: "Local Support", desc: "Somali-speaking support team available via WhatsApp and phone." },
              { icon: Heart, title: "Customer Focus", desc: "Your satisfaction drives every decision we make." },
              { icon: Award, title: "Competitive Pricing", desc: "Direct sourcing eliminates middlemen and reduces costs." },
            ].map((v, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-6">
                <div className="w-12 h-12 rounded-xl bg-[#FFF3E9] flex items-center justify-center mb-4">
                  <v.icon className="w-6 h-6 text-[#FF5A0A]" />
                </div>
                <h3 className="font-bold text-[#111111] mb-2">{v.title}</h3>
                <p className="text-sm text-[#667085] leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>

          {/* Story */}
          <div className="bg-white rounded-2xl shadow-card border border-[#E9E5E1]/50 p-8 md:p-12">
            <h2 className="text-2xl font-bold text-[#111111] mb-4">Our Story</h2>
            <div className="space-y-4 text-[#667085] leading-relaxed">
              <p>
                ChinaSuuq was born from a simple observation: Somali customers want access to the vast product selection of Chinese marketplaces, but language barriers, payment challenges, and logistics complexity make direct purchasing nearly impossible.
              </p>
              <p>
                Our team combines expertise in Chinese commerce, Somali market needs, and modern technology to create a platform that handles everything from product discovery to final delivery.
              </p>
              <p>
                With warehouse operations in Yiwu and delivery networks across Somalia, ChinaSuuq is building the infrastructure for seamless China-to-Somalia commerce.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFAB />
    </main>
  );
}
