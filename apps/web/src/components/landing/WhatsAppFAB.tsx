'use client';

import { MessageCircle } from "lucide-react";

export function WhatsAppFAB() {
  return (
    <a
      href="https://wa.me/8615277074143"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-whatsapp hover:bg-[#20BA5C] text-white pl-4 pr-5 py-3.5 rounded-full shadow-lg shadow-whatsapp/25 transition-all duration-200 active:scale-95 group whatsapp-pulse"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="w-5 h-5" />
      <span className="hidden sm:inline text-sm font-semibold">
        Chat on WhatsApp
      </span>
    </a>
  );
}
export default WhatsAppFAB;
