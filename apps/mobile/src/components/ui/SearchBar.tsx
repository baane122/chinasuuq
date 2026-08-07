import React from "react";
import {
  View,
  TextInput,
  StyleSheet,
  ViewStyle,
  TextInputProps,
} from "react-native";
import { Search, X } from "lucide-react-native";
import { COLORS, SPACING, RADIUS, FONTS } from "@/lib/theme";

interface SearchBarProps extends Omit<TextInputProps, "style"> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search products...",
  style,
  ...rest
}: SearchBarProps) {
  return (
    <View style={[styles.container, style]}>
      <Search size={18} color={COLORS.gray400} style={styles.searchIcon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray400}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
      />
      {value.length > 0 && (
        <View
          style={styles.clearButton}
          onTouchEnd={() => onChangeText("")}
        >
          <X size={16} color={COLORS.gray400} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.black,
    height: "100%",
  },
  clearButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: COLORS.gray200,
    marginLeft: SPACING.sm,
    // Minimum touch target
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
