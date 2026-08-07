import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  Search,
  ArrowLeft,
  X,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { getProducts } from "@/db";
import { ProductCard } from "@/components/home/ProductCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Product } from "@/types";

// Derived filter chips from data (plus "All")
type SortKey = "relevance" | "price-asc" | "price-desc" | "rating" | "sales";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "price-asc", label: "Price ↑" },
  { key: "price-desc", label: "Price ↓" },
  { key: "rating", label: "Top rated" },
  { key: "sales", label: "Best selling" },
];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function matchesQuery(p: Product, q: string): boolean {
  if (!q) return true;
  const target =
    `${p.title_english} ${p.title_original} ${p.title_somali}`.toLowerCase();
  return q.split(/\s+/).every((token) => target.includes(token));
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ marketplace?: string; q?: string }>();

  const [query, setQuery] = useState(params.q ?? "");
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>(
    params.marketplace ?? "all"
  );
  const [sort, setSort] = useState<SortKey>("relevance");
  const [showSort, setShowSort] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProducts()
      .then((data) => {
        if (active) setProducts(data);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Update marketplace when the home screen navigates here with a param.
  useEffect(() => {
    if (params.marketplace) {
      setMarketplaceFilter(params.marketplace);
    }
    if (params.q != null) {
      setQuery(params.q);
    }
  }, [params.marketplace, params.q]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const marketplaces = useMemo(() => {
    const set = new Set(products.map((p) => p.marketplace).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (marketplaceFilter !== "all" && p.marketplace !== marketplaceFilter) {
        return false;
      }
      return matchesQuery(p, query);
    });

    // Sort
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return a.price_usd_estimated - b.price_usd_estimated;
        case "price-desc":
          return b.price_usd_estimated - a.price_usd_estimated;
        case "rating":
          return b.supplier_rating - a.supplier_rating;
        case "sales":
          return b.sales_count - a.sales_count;
        default:
          return 0;
      }
    });
    return list;
  }, [products, query, marketplaceFilter, sort]);

  const pickSort = (key: SortKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSort(key);
    setShowSort(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.searchRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color={COLORS.black} />
          </TouchableOpacity>

          <View style={styles.searchInput}>
            <Search size={18} color={COLORS.gray400} />
            <TextInput
              style={styles.input}
              placeholder="Search products..."
              placeholderTextColor={COLORS.gray400}
              value={query}
              onChangeText={setQuery}
              autoFocus={!params.q}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={COLORS.gray400} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.filterBtn, showSort && styles.filterBtnActive]}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSort((v) => !v);
            }}
          >
            <ArrowUpDown size={20} color={showSort ? COLORS.white : COLORS.black} />
          </TouchableOpacity>
        </View>

        {/* Loading */}
        {loading ? (
          <LoadingSpinner fullScreen />
        ) : (
          <>
            {/* Category chips */}
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterContent}
              >
                <TouchableOpacity
                  onPress={() => setMarketplaceFilter("all")}
                  style={[styles.chip, marketplaceFilter === "all" && styles.chipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, marketplaceFilter === "all" && styles.chipTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                {marketplaces.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMarketplaceFilter(m)}
                    style={[styles.chip, marketplaceFilter === m && styles.chipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, marketplaceFilter === m && styles.chipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Category filter row */}
              {categories.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterContent}
                >
                  <TouchableOpacity
                    onPress={() => setMarketplaceFilter("category-all")}
                    style={[styles.chip, marketplaceFilter === "category-all" && styles.chipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, marketplaceFilter === "category-all" && styles.chipTextActive]}>
                      All categories
                    </Text>
                  </TouchableOpacity>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() =>
                        // store category selection in a distinct sentinel key
                        setMarketplaceFilter(`cat:${c}`)
                      }
                      style={[styles.chip, marketplaceFilter === `cat:${c}` && styles.chipActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, marketplaceFilter === `cat:${c}` && styles.chipActive && styles.chipTextActive]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Sort dropdown */}
            {showSort && (
              <View style={styles.sortPanel}>
                {SORTS.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.sortOption, sort === s.key && styles.sortOptionActive]}
                    onPress={() => pickSort(s.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sortOptionText, sort === s.key && styles.sortOptionTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Result count */}
            <View style={styles.resultRow}>
              <SlidersHorizontal size={14} color={COLORS.textSecondary} />
              <Text style={styles.resultText}>
                {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}
              </Text>
            </View>

            {filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyTitle}>No products found</Text>
                <Text style={styles.emptySubtitle}>
                  Try adjusting your search or filters
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.grid}
              >
                {filteredProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onPress={() => router.push(`/product/${p.id}`)}
                  />
                ))}
                <View style={{ height: 40, width: "100%" }} />
              </ScrollView>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.warmWhite },
  keyboardView: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.black, padding: 0 },
  filterBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterContent: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontFamily: FONTS.semibold, color: COLORS.black },
  chipTextActive: { color: COLORS.white },
  sortPanel: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  sortOption: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  sortOptionActive: { backgroundColor: COLORS.softOrange },
  sortOptionText: { fontSize: 14, fontFamily: FONTS.medium, color: COLORS.black },
  sortOptionTextActive: { color: COLORS.primary, fontFamily: FONTS.bold },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  resultText: { fontSize: 12, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xxl,
  },
  emptyEmoji: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.black, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
});
