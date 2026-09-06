import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Plane,
  Ship,
  Clock,
  DollarSign,
  MapPin,
  Package,
  Calculator,
  Info,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import {
  calculateShipping,
  type ProductShipping,
  type ShippingEstimate,
} from "@/lib/shipping";

const CITIES = [
  "Mogadishu",
  "Hargeisa",
  "Bosaso",
  "Kismayo",
  "Baidoa",
  "Garowe",
  "Berbera",
];

export default function ShippingInfoScreen() {
  const { locale } = useI18n();
  const router = useRouter();

  // Shipping calculator state
  const [weight, setWeight] = useState("1");
  const [quantity, setQuantity] = useState("1");
  const [airEstimate, setAirEstimate] = useState<ShippingEstimate | null>(null);
  const [seaEstimate, setSeaEstimate] = useState<ShippingEstimate | null>(null);

  const calculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const w = parseFloat(weight) || 1;
    const q = parseInt(quantity) || 1;

    const product: ProductShipping = {
      weight_kg: w,
      domestic_shipping_cny: 0,
      marketplace: "manual",
    };

    setAirEstimate(calculateShipping(product, q, "air"));
    setSeaEstimate(calculateShipping(product, q, "sea"));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {locale === "en" ? "Shipping Info" : "Macluumaadka Rarka"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Air vs Sea Comparison */}
        <Text style={styles.sectionLabel}>
          {locale === "en" ? "Shipping Methods" : "Hababka Rarka"}
        </Text>
        <View style={styles.methodRow}>
          <View style={[styles.methodCard, styles.airCard]}>
            <Plane size={32} color={COLORS.air} />
            <Text style={styles.methodTitle}>
              {locale === "en" ? "Air Freight" : "Rarka Hawada"}
            </Text>
            <Text style={[styles.methodTime, { color: COLORS.air }]}>
              7–14 {locale === "en" ? "days" : "maalmood"}
            </Text>
            <Text style={styles.methodPrice}>~$8.50/kg</Text>
            <Text style={styles.methodDesc}>
              {locale === "en"
                ? "Fast delivery, best for urgent orders. Minimum charge $15."
                : "Gaarsiin degdeg ah, ugu fiican dalabyada degdegga ah. $15 ugu yar."}
            </Text>
          </View>
          <View style={[styles.methodCard, styles.seaCard]}>
            <Ship size={32} color={COLORS.sea} />
            <Text style={styles.methodTitle}>
              {locale === "en" ? "Sea Freight" : "Rarka Badda"}
            </Text>
            <Text style={[styles.methodTime, { color: COLORS.sea }]}>
              25–35 {locale === "en" ? "days" : "maalmood"}
            </Text>
            <Text style={styles.methodPrice}>~$2.20/kg</Text>
            <Text style={styles.methodDesc}>
              {locale === "en"
                ? "Economical, best for bulk orders. Min 10kg charge."
                : "Dhaqaale, ugu fiican dalabyada tiro badan. Min 10kg."}
            </Text>
          </View>
        </View>

        {/* Cost Calculator */}
        <View style={styles.calcCard}>
          <View style={styles.calcHeader}>
            <Calculator size={18} color={COLORS.primary} />
            <Text style={styles.calcTitle}>
              {locale === "en" ? "Shipping Cost Calculator" : "Kalkuleyterka Kharashka Rarka"}
            </Text>
          </View>
          <Text style={styles.calcSubtitle}>
            {locale === "en"
              ? "Estimate your shipping cost based on weight and quantity"
              : "Qiyaasi kharashka rarka ee ku salaysan miisaanka iyo tirooyinka"}
          </Text>

          <View style={styles.calcRow}>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>
                {locale === "en" ? "Weight (kg)" : "Miisaan (kg)"}
              </Text>
              <TextInput
                style={styles.calcInput}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>
                {locale === "en" ? "Quantity" : "Tiro"}
              </Text>
              <TextInput
                style={styles.calcInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <TouchableOpacity
              style={styles.calcBtn}
              onPress={calculate}
              activeOpacity={0.8}
            >
              <Text style={styles.calcBtnText}>
                {locale === "en" ? "Estimate" : "Qiyaasi"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {airEstimate && seaEstimate && (
            <View style={styles.calcResults}>
              <View style={styles.calcResultRow}>
                <View style={styles.calcResultLeft}>
                  <Plane size={16} color={COLORS.air} />
                  <Text style={styles.calcResultMethod}>
                    {locale === "en" ? "Air Freight" : "Rarka Hawada"}
                  </Text>
                </View>
                <Text style={styles.calcResultDays}>{airEstimate.days} days</Text>
                <Text style={[styles.calcResultCost, { color: COLORS.air }]}>
                  ${airEstimate.costUSD.toFixed(2)}
                </Text>
              </View>
              <View style={styles.calcResultDivider} />
              <View style={styles.calcResultRow}>
                <View style={styles.calcResultLeft}>
                  <Ship size={16} color={COLORS.sea} />
                  <Text style={styles.calcResultMethod}>
                    {locale === "en" ? "Sea Freight" : "Rarka Badda"}
                  </Text>
                </View>
                <Text style={styles.calcResultDays}>{seaEstimate.days} days</Text>
                <Text style={[styles.calcResultCost, { color: COLORS.sea }]}>
                  ${seaEstimate.costUSD.toFixed(2)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* How Shipping Works */}
        <Text style={styles.sectionLabel}>
          {locale === "en" ? "How Shipping Works" : "Sida Rarku u Shaqeeyo"}
        </Text>
        {[
          {
            icon: Package,
            title:
              locale === "en" ? "Order Processed" : "Dalab la Processed",
            desc:
              locale === "en"
                ? "Your order is sourced from China and shipped to our warehouse"
                : "Dalabkaaga waa laga helaa Shiinaha wuxuuna u socdaa xaruntayada",
          },
          {
            icon: MapPin,
            title:
              locale === "en" ? "Arrives in Somalia" : "Wuxuu gaaro Soomaaliya",
            desc:
              locale === "en"
                ? "Goods arrive at our Somalia warehouse and are inspected"
                : "Alaabtu waxay gaaraysaa xaruntayada Soomaaliya waxaana la hubiyaa",
          },
          {
            icon: Clock,
            title: locale === "en" ? "Pay Shipping" : "Bixi Rarka",
            desc:
              locale === "en"
                ? "Pay the international shipping fee upon arrival"
                : "Bixi khidmadda rarka caalamiga ah marka la gaaro",
          },
          {
            icon: DollarSign,
            title:
              locale === "en" ? "Receive Your Order" : "Hel Dalabkaaga",
            desc:
              locale === "en"
                ? "Get your items delivered to your city across Somalia"
                : "Hel alaabtaada oo la geeyo magaaladaada Soomaaliya",
          },
        ].map((s, i) => (
          <View key={i} style={styles.processCard}>
            <View style={styles.processIconWrap}>
              <s.icon size={20} color={COLORS.primary} />
            </View>
            <View style={styles.processTextBlock}>
              <Text style={styles.processTitle}>{s.title}</Text>
              <Text style={styles.processDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}

        {/* Note */}
        <View style={styles.noteCard}>
          <Info size={16} color={COLORS.info} />
          <Text style={styles.noteText}>
            {locale === "en"
              ? "Shipping costs shown are estimates. Final cost depends on actual weight and dimensions after warehouse inspection. Domestic shipping within China is included in the product price."
              : "Kharashka rarka ee la muujinayo waa qiyaaso. Kharashka dambe wuxuu ku xiran yahay miisaanka runta ah iyo cabbirada ka dib hubinta xarunta. Rarka gudaha Shiinaha waa ku jira qiimaha alaabta."}
          </Text>
        </View>

        {/* Delivery Cities */}
        <Text style={styles.sectionLabel}>
          {locale === "en" ? "Delivery Cities" : "Magaalooyinka Gaarsiinta"}
        </Text>
        <View style={styles.citiesRow}>
          {CITIES.map((c) => (
            <View key={c} style={styles.cityPill}>
              <MapPin size={12} color={COLORS.primary} />
              <Text style={styles.cityText}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    textAlign: "center",
    marginRight: 44,
  },
  content: { padding: SPACING.lg },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Method comparison
  methodRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  methodCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  airCard: { borderColor: COLORS.air + "40" },
  seaCard: { borderColor: COLORS.sea + "40" },
  methodTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    color: COLORS.black,
    marginTop: SPACING.md,
  },
  methodTime: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    marginTop: SPACING.xs,
  },
  methodPrice: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  methodDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: "center",
    lineHeight: 16,
  },

  // Calculator
  calcCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
  },
  calcHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: 4,
  },
  calcTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  calcSubtitle: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  calcRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-end",
  },
  calcField: { flex: 1 },
  calcLabel: {
    fontSize: 11,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  calcInput: {
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.black,
    height: 40,
    textAlign: "center",
  },
  calcBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  calcBtnText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.white,
  },
  calcResults: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  calcResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  calcResultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flex: 1,
  },
  calcResultMethod: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
  calcResultDays: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    width: 55,
    textAlign: "center",
  },
  calcResultCost: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    width: 70,
    textAlign: "right",
  },
  calcResultDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },

  // Process
  processCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  processIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.softOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  processTextBlock: { flex: 1 },
  processTitle: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    color: COLORS.black,
  },
  processDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // Note
  noteCard: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: COLORS.infoBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Cities
  citiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  cityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cityText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.black,
  },
});
