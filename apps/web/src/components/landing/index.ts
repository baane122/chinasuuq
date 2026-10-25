// Barrel exports for landing components
// Each component uses `export default`, so we re-export as named via `default`
export { default as Header } from "./Header";
export { default as Hero } from "./Hero";
export { default as SearchBar } from "./SearchBar";
export { default as TrustBar } from "./TrustBar";
export { default as HowItWorks } from "./HowItWorks";
export { default as AppDownload } from "./AppDownload";
export { default as Footer } from "./Footer";
export { default as WhatsAppFAB } from "./WhatsAppFAB";
export { default as TrendingProducts } from "./TrendingProducts";

// The showcase card (2026-10-16). The SHOP is the mobile app: this site shows a
// product honestly and hands the customer to a sourcing agent or the app, so the
// card exports its enquiry link instead of a product-page link.
export { default as ProductCard } from "./ProductCard";
export { enquiryLink, productPrice, formatCny, ProductImagePlaceholder } from "./ProductCard";
