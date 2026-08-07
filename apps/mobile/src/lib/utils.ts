// Self-contained utility functions for the mobile app

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatCNY(amount: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function generateOrderRef(): string {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `CS-${year}-${random}`;
}

export function truncate(text: string, length = 80): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

export const WHATSAPP_NUMBER = "8615277074143";

export function whatsappOrderLink(product?: string): string {
  const msg = product
    ? `Hello ChinaSuuq, I want to order: ${product}\n\nQuantity:\nColor/size:\nDestination city:\nPreferred shipping: Air/Sea`
    : "Hello ChinaSuuq, I want to order products from China.\n\nProduct link:\nQuantity:\nColor/size:\nDestination city:\nPreferred shipping: Air/Sea";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}
