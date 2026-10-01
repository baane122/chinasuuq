/**
 * Single source of truth for the support WhatsApp number.
 *
 * The number is injected at build time by `next.config.ts`
 * (`NEXT_PUBLIC_WHATSAPP_NUMBER`); the literal below is only a fallback so a
 * missing env can never break the funnel. Every component must import from
 * here instead of hardcoding the number — it was previously duplicated as a
 * string literal in 15 files.
 */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "8615277074143";

/** Plain chat link, with an optional pre-filled first message. */
export function waLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Open a WhatsApp chat in a new tab with a pre-filled message. */
export function openWhatsApp(message?: string): void {
  window.open(waLink(message), "_blank", "noopener,noreferrer");
}

/** Back-compat alias used across existing pages. */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
