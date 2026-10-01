// WHATSAPP_NUMBER / WHATSAPP_LINK re-exports kept intentionally (used by the
// codebase via @/lib/whatsapp and @/lib/utils; kept here for parity).
// Formerly-exported COLORS, SITE_URL, ADMIN_SESSION_COOKIE, CATEGORIES and
// MARKETPLACES were removed — they had zero imports anywhere in apps/web.
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";
export { WHATSAPP_NUMBER };
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
