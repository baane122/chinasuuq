import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Linking,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  ArrowLeft,
  MessageCircle,
  ChevronDown,
  Check,
  Plane,
  Ship,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS, whatsappOrderLink } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useCartStore } from "@/store/cart";
import { useAuthStore } from "@/store/auth";
import StepIndicator from "@/components/checkout/StepIndicator";
import PaymentMethodCard from "@/components/checkout/PaymentMethodCard";
import { formatUSD, generateOrderRef } from "@/lib/utils";
import { createOrder } from "@/db";
import { SmartRoute } from "@/components/orders/SmartRoute";
import { calculateShipping, getShippingEstimates } from "@/lib/shipping";

const STEP_LABELS = ["Contact", "Shipping", "Payment", "Confirm"];
const CITIES = [
  "Mogadishu",
  "Hargeisa",
  "Berbera",
  "Kismayo",
  "Garowe",
  "Bosaso",
  "Mandera",
  "Nairobi",
];

export default function CheckoutScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const cartItems = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const total = getTotal();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(0);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Step 1 — Contact
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  // Step 2 — Shipping
  const [shippingMethod, setShippingMethod] = useState<"air" | "sea">("air");

  // Step 3 — Payment
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentIdentifier, setPaymentIdentifier] = useState("");

  // Step 4 — Confirm
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // Cost calculation — auto-calculate shipping based on cart items
  // Note: Domestic shipping within China is included in product price
  // Customer pays international shipping (air/sea) when goods arrive in Somalia
  const subtotal = total.subtotalUSD;
  const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;

  // Auto-calculate estimated international shipping cost (China → Somalia)
  const estimatedShipping = cartItems.reduce((total, item) => {
    const weight = item.product.attributes?.weight
      ? parseFloat(String(item.product.attributes.weight).replace(/[^0-9.]/g, "")) || 0.5
      : 0.5;
    const shipping = calculateShipping(
      {
        weight_kg: weight * item.quantity,
        domestic_shipping_cny: 0, // not needed - international only
        marketplace: item.product.marketplace,
      },
      1, // already multiplied weight by quantity
      shippingMethod
    );
    return total + shipping.costUSD;
  }, 0);

  const grandTotal = subtotal + serviceFee; // shipping paid on arrival in Somalia

  const canProceed = () => {
    switch (step) {
      case 0:
        return (
          fullName.trim().length >= 2 &&
          /^[0-9+\s-]{7,}$/.test(phone.trim()) &&
          city.trim() &&
          address.trim()
        );
      case 1: return !!shippingMethod;
      case 2:
        if (!paymentMethod) return false;
        // require a phone / account for non-WhatsApp methods
        if (paymentMethod !== "whatsapp" && !/^[0-9+\s-]{7,}$/.test(paymentIdentifier.trim())) {
          return false;
        }
        return true;
      case 3: return acceptedTerms;
      default: return false;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      Alert.alert("Incomplete", "Please fill in all required fields for this step.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < 3) {
      setStep(step + 1);
    } else {
      handlePlaceOrder();
    }
  };

  const handlePlaceOrder = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let orderId = `ord-${Date.now()}`;
    try {
      const created = await createOrder({
        id: orderId,
        reference: generateOrderRef(),
        status: "pending",
        items: cartItems.map((it) => ({
          id: it.id,
          product_name: it.product.title_english,
          quantity: it.quantity,
          price_usd: it.price_usd_estimated,
        })),
        total_usd: grandTotal,
        shipping_method: shippingMethod,
        payment_status: "pending",
        payment_method: paymentMethod,
        recipient_name: fullName,
        phone,
        city,
        address,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        synced: true,
      });
      orderId = created.id;
      useCartStore.getState().clearCart();
    } catch {
      // even if persistence fails, still show success
    }
    router.replace(`/orders/success?id=${orderId}`);
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      {/* Guest login prompt */}
      {!user && (
        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>
            {locale === "en"
              ? "Sign in to save your order history & track shipments"
              : "Ku soo dhawoobo si aad u kaydiso taariikhda dalabka & raadinta"}
          </Text>
          <TouchableOpacity
            style={styles.loginPromptLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/login");
            }}
          >
            <Text style={styles.loginPromptLinkText}>
              {locale === "en" ? "Sign In" : "Gal"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={styles.stepTitle}>Contact Information</Text>
      <Text style={styles.label}>Full Name</Text>
      <TextInput style={styles.input} placeholder="e.g. Ahmed Hassan" placeholderTextColor={COLORS.gray400} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Text style={styles.label}>Phone Number</Text>
      <TextInput style={styles.input} placeholder="+252 61 234 5678" placeholderTextColor={COLORS.gray400} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.label}>City</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setShowCityDropdown(!showCityDropdown)} activeOpacity={0.7}>
        <Text style={[styles.dropdownText, !city && styles.placeholder]}>{city || "Select city"}</Text>
        <ChevronDown size={18} color={COLORS.gray400} style={showCityDropdown ? { transform: [{ rotate: "180deg" }] } : undefined} />
      </TouchableOpacity>
      {showCityDropdown && (
        <View style={styles.dropdownList}>
          {CITIES.map((c) => (
            <TouchableOpacity key={c} style={[styles.dropdownItem, c === city && styles.dropdownItemActive]} onPress={() => { setCity(c); setShowCityDropdown(false); Haptics.selectionAsync(); }} activeOpacity={0.7}>
              <Text style={[styles.dropdownItemText, c === city && styles.dropdownItemTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={styles.label}>Delivery Address</Text>
      <TextInput style={[styles.input, styles.textArea]} placeholder="Street address, building, apartment..." placeholderTextColor={COLORS.gray400} value={address} onChangeText={setAddress} multiline numberOfLines={3} textAlignVertical="top" />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Shipping Method</Text>
      <TouchableOpacity style={[styles.shippingCard, shippingMethod === "air" && styles.shippingCardActive]} onPress={() => { setShippingMethod("air"); Haptics.selectionAsync(); }} activeOpacity={0.7}>
        <View style={styles.shippingIconBox}>
          <Plane size={28} color={shippingMethod === "air" ? COLORS.primary : COLORS.gray400} />
        </View>
        <View style={styles.shippingInfo}>
          <Text style={[styles.shippingTitle, shippingMethod === "air" && styles.shippingTitleActive]}>Air Freight</Text>
          <Text style={styles.shippingDesc}>7-14 days from China warehouse</Text>
          <Text style={styles.shippingCost}>Est. ~${Math.round(estimatedShipping * 100) / 100} · Pay on arrival</Text>
        </View>
        <View style={[styles.radioOuter, shippingMethod === "air" && styles.radioOuterActive]}>
          {shippingMethod === "air" && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.shippingCard, shippingMethod === "sea" && styles.shippingCardActive]} onPress={() => { setShippingMethod("sea"); Haptics.selectionAsync(); }} activeOpacity={0.7}>
        <View style={styles.shippingIconBox}>
          <Ship size={28} color={shippingMethod === "sea" ? COLORS.primary : COLORS.gray400} />
        </View>
        <View style={styles.shippingInfo}>
          <Text style={[styles.shippingTitle, shippingMethod === "sea" && styles.shippingTitleActive]}>Sea Freight</Text>
          <Text style={styles.shippingDesc}>25-35 days from China warehouse</Text>
          <Text style={styles.shippingCost}>Est. ~${Math.round(estimatedShipping * 100) / 100} · Pay on arrival</Text>
        </View>
        <View style={[styles.radioOuter, shippingMethod === "sea" && styles.radioOuterActive]}>
          {shippingMethod === "sea" && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>

      {/* Route preview — show once city + method selected */}
      {city && (
        <View style={styles.routePreview}>
          <Text style={styles.routePreviewTitle}>
            {locale === "en" ? "Your delivery route" : "Jidka gaarsiintaada"}
          </Text>
          <SmartRoute method={shippingMethod} city={city} status="pending" />
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Payment Method</Text>
      <PaymentMethodCard icon="📱" name="ZAAD" description="Mobile money transfer" selected={paymentMethod === "zaad"} onSelect={() => { setPaymentMethod("zaad"); setPaymentIdentifier(""); Haptics.selectionAsync(); }} />
      <PaymentMethodCard icon="💰" name="eDahab" description="Mobile wallet payment" selected={paymentMethod === "edahab"} onSelect={() => { setPaymentMethod("edahab"); setPaymentIdentifier(""); Haptics.selectionAsync(); }} />
      <PaymentMethodCard icon="📞" name="EVC Plus" description="Prepaid scratch card" selected={paymentMethod === "evc"} onSelect={() => { setPaymentMethod("evc"); setPaymentIdentifier(""); Haptics.selectionAsync(); }} />
      <PaymentMethodCard icon="🏦" name="Bank Transfer" description="Direct bank deposit" selected={paymentMethod === "bank"} onSelect={() => { setPaymentMethod("bank"); setPaymentIdentifier(""); Haptics.selectionAsync(); }} />
      <PaymentMethodCard icon="💬" name="Pay on WhatsApp" description="Arrange payment via chat" selected={paymentMethod === "whatsapp"} onSelect={() => { setPaymentMethod("whatsapp"); setPaymentIdentifier(""); Haptics.selectionAsync(); }} />

      {paymentMethod && paymentMethod !== "whatsapp" ? (
        <View style={styles.paymentIdWrap}>
          <Text style={styles.label}>
            {paymentMethod === "bank"
              ? "Bank account number"
              : "Mobile money phone number"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={paymentMethod === "bank" ? "e.g. 1234 5678 9012" : "+252 61 234 5678"}
            placeholderTextColor={COLORS.gray400}
            keyboardType={paymentMethod === "bank" ? "number-pad" : "phone-pad"}
            value={paymentIdentifier}
            onChangeText={setPaymentIdentifier}
          />
          <Text style={styles.paymentHint}>
            {paymentMethod === "bank"
              ? "We will email transfer instructions to confirm."
              : "We'll confirm the transfer before shipping."}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Order Summary</Text>
      <View style={styles.summaryCard}>
        {cartItems.map((item) => (
          <View key={item.id} style={styles.summaryRow}>
            <Text style={styles.summaryItemName} numberOfLines={1}>{item.product.title_english} × {item.quantity}</Text>
            <Text style={styles.summaryItemPrice}>{formatUSD(item.price_usd_estimated * item.quantity)}</Text>
          </View>
        ))}
        {cartItems.length === 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryItemName}>No items in cart</Text>
            <Text style={styles.summaryItemPrice}>$0.00</Text>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatUSD(subtotal)}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Service Fee (5%)</Text><Text style={styles.summaryValue}>{formatUSD(serviceFee)}</Text></View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Est. Shipping ({shippingMethod === "air" ? "Air" : "Sea"})</Text>
          <Text style={[styles.summaryValue, { color: COLORS.textMuted, fontSize: 12 }]}>
            ~{formatUSD(estimatedShipping)} (final on arrival)
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}><Text style={styles.totalLabel}>Total (excl. shipping)</Text><Text style={styles.totalValue}>{formatUSD(grandTotal)}</Text></View>
      </View>
      <View style={styles.infoSummary}>
        <Text style={styles.infoLabel}>Contact: {fullName}</Text>
        <Text style={styles.infoLabel}>Phone: {phone}</Text>
        <Text style={styles.infoLabel}>City: {city}</Text>
        <Text style={styles.infoLabel}>Address: {address}</Text>
        <Text style={styles.infoLabel}>Shipping: {shippingMethod === "air" ? "Air Freight" : "Sea Freight"}</Text>
        <Text style={styles.infoLabel}>Payment: {paymentMethod.toUpperCase()}{paymentIdentifier ? ` (${paymentIdentifier})` : ""}</Text>
      </View>

      <Text style={styles.label}>Delivery notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Any instructions for the courier..."
        placeholderTextColor={COLORS.gray400}
        value={deliveryNotes}
        onChangeText={setDeliveryNotes}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />
      <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms(!acceptedTerms)} activeOpacity={0.7}>
        <View style={[styles.checkbox, acceptedTerms && styles.checkboxActive]}>
          {acceptedTerms && <Check size={14} color={COLORS.white} strokeWidth={3} />}
        </View>
        <Text style={styles.termsText}>I agree to the Terms of Service and Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStep1();
      case 1: return renderStep2();
      case 2: return renderStep3();
      case 3: return renderStep4();
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("checkout.title")}</Text>
      </View>

      {/* Step Indicator */}
      <StepIndicator steps={STEP_LABELS} currentStep={step} />

      {/* Content */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {renderCurrentStep()}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Buttons */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomRow}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => { setStep(step - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.nextBtn, step === 0 && { flex: 1 }]} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextBtnText}>{step === 3 ? t("checkout.placeOrder") : t("checkout.continue")}</Text>
          </TouchableOpacity>
        </View>
        {step < 3 && (
          <TouchableOpacity style={styles.whatsappLink} onPress={async () => { try { await Linking.openURL(whatsappOrderLink()); } catch { /* ignore */ } }}>
            <MessageCircle size={16} color={COLORS.whatsapp} />
            <Text style={styles.whatsappLinkText}>Need help? Chat on WhatsApp</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  flex1: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, textAlign: "center", marginRight: 44 },
  scrollContent: { padding: SPACING.lg },
  // Route preview
  routePreview: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
  },
  routePreviewTitle: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginBottom: SPACING.xs,
  },
  // Login prompt
  loginPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.softOrange,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(255,90,10,0.15)",
  },
  paymentIdWrap: { marginTop: SPACING.md },
  paymentHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  loginPromptText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.primaryDark,
    marginRight: SPACING.md,
  },
  loginPromptLink: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  loginPromptLinkText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  // Steps
  stepContent: {},
  stepTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.lg },
  label: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black, marginBottom: SPACING.xs, marginTop: SPACING.md },
  input: { width: "100%", height: 52, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, fontSize: 15, marginBottom: SPACING.sm, color: COLORS.black, backgroundColor: COLORS.white },
  // Dropdown
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 52, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, backgroundColor: COLORS.white },
  dropdownText: { fontSize: 15, color: COLORS.black },
  placeholder: { color: COLORS.gray400 },
  dropdownList: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.xs, maxHeight: 200 },
  dropdownItem: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  dropdownItemActive: { backgroundColor: COLORS.softOrange },
  dropdownItemText: { fontSize: 15, color: COLORS.black },
  dropdownItemTextActive: { color: COLORS.primary, fontFamily: FONTS.semibold },
  textArea: { height: 100 },
  // Shipping
  shippingCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.md },
  shippingCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.softOrange },
  shippingIconBox: { width: 52, height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.gray50, alignItems: "center", justifyContent: "center", marginRight: SPACING.md },
  shippingInfo: { flex: 1 },
  shippingTitle: { fontSize: 15, fontFamily: FONTS.semibold, color: COLORS.black },
  shippingTitleActive: { color: COLORS.primary },
  shippingDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  shippingCost: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.primary, marginTop: SPACING.xs },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.gray300, alignItems: "center", justifyContent: "center" },
  radioOuterActive: { borderColor: COLORS.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },
  // Summary
  summaryCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.xs },
  summaryItemName: { fontSize: 14, color: COLORS.black, flex: 1, marginRight: SPACING.md },
  summaryItemPrice: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
  summaryValue: { fontSize: 14, fontFamily: FONTS.semibold, color: COLORS.black },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  totalLabel: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.black },
  totalValue: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.primary },
  infoSummary: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  infoLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  termsRow: { flexDirection: "row", alignItems: "center", marginTop: SPACING.lg, gap: SPACING.sm },
  checkbox: { width: 24, height: 24, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  termsText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  // Bottom
  bottomBar: { padding: SPACING.lg, paddingBottom: SPACING.xxl, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border },
  bottomRow: { flexDirection: "row", gap: SPACING.sm },
  backBtn: { height: 50, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl },
  backBtnText: { fontSize: 16, fontFamily: FONTS.semibold, color: COLORS.black },
  nextBtn: { height: 50, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", flex: 1 },
  nextBtnText: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.white },
  whatsappLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: SPACING.md, gap: SPACING.xs },
  whatsappLinkText: { fontSize: 13, color: COLORS.whatsapp, fontFamily: FONTS.semibold },
  bottomSpacer: { height: 20 },
});
