"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import QuoteForm from "./QuoteForm";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultUrl?: string;
  defaultMarketplace?: string;
}

/** Modal shell around QuoteForm for inline entry points
 *  (SearchBar paste-link, marketplace detail pages, business page). */
export default function QuoteRequestModal({ open, onClose, defaultUrl, defaultMarketplace }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape to close + scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-dark-950/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Request a quote"
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative my-8 w-full max-w-2xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 rounded-full border border-dark-900/10 bg-white p-2 text-dark-900/60 shadow-md transition-colors hover:text-dark-900"
            >
              <X className="h-4 w-4" />
            </button>
            <QuoteForm
              defaultUrl={defaultUrl}
              defaultMarketplace={defaultMarketplace}
              onSubmitted={undefined}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
