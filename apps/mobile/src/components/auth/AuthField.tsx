import {
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AlertCircle, Eye, EyeOff } from "lucide-react-native";
import { COLORS, FONTS, RADIUS, SPACING } from "@/lib/theme";

type TextInputProps = ComponentProps<typeof TextInput>;

export interface AuthFieldProps {
  /** Visible label; also used as the input's accessibility label. */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Leading icon element, e.g. <Mail size={18} ... />. */
  icon?: ReactNode;
  /** Right side of the label row (e.g. "Forgot password?" link). */
  labelTrailing?: ReactNode;
  /** Field-level inline error. Rendered under the input. */
  error?: string | null;
  helper?: string;
  /** Password-style field: renders the working reveal toggle. */
  secure?: boolean;
  /** Localized a11y labels for the reveal toggle (required when secure). */
  showLabel?: string;
  hideLabel?: string;
  /** Custom trailing node (e.g. a "passwords match" check icon). */
  trailing?: ReactNode;
  inputRef?: RefObject<ComponentRef<typeof TextInput> | null>;
  returnKeyType?: TextInputProps["returnKeyType"];
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ComponentProps<typeof View>["style"];
  onBlur?: () => void;
  onSubmitEditing?: () => void;
}

/**
 * One input row: label, leading icon, 54px field with a real focus state,
 * optional working reveal toggle (44px hit area), and inline error text.
 */
export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  labelTrailing,
  error,
  helper,
  secure,
  showLabel,
  hideLabel,
  trailing,
  inputRef,
  returnKeyType,
  autoComplete,
  textContentType,
  keyboardType,
  autoCapitalize = "sentences",
  autoCorrect,
  editable = true,
  autoFocus,
  maxLength,
  multiline,
  numberOfLines,
  style,
  onBlur,
  onSubmitEditing,
}: AuthFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? COLORS.error
    : focused
      ? COLORS.primary
      : COLORS.border;

  return (
    <View style={[styles.group, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelTrailing}
      </View>

      <View
        style={[
          styles.wrapper,
          multiline && styles.wrapperMultiline,
          { borderColor, backgroundColor: focused ? COLORS.white : COLORS.gray50 },
          !editable && styles.wrapperDisabled,
        ]}
      >
        {icon ? (
          <View style={[styles.iconBox, multiline && styles.iconBoxMultiline]}>{icon}</View>
        ) : null}
        <TextInput
          ref={inputRef}
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={!!secure && !revealed}
          editable={editable}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={numberOfLines}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmitEditing}
        />
        {trailing}
        {secure ? (
          <TouchableOpacity
            style={styles.revealHit}
            onPress={() => setRevealed((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={revealed ? hideLabel : showLabel}
            accessibilityState={{ selected: revealed }}
          >
            {revealed ? (
              <EyeOff size={20} color={COLORS.gray600} />
            ) : (
              <Eye size={20} color={COLORS.gray600} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: SPACING.lg,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
    color: COLORS.gray700,
    flexShrink: 1,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: 54,
  },
  wrapperMultiline: {
    minHeight: 88,
    alignItems: "flex-start",
  },
  wrapperDisabled: {
    opacity: 0.6,
  },
  iconBox: {
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  iconBoxMultiline: {
    marginTop: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.black,
    paddingVertical: 0,
  },
  inputMultiline: {
    paddingTop: 14,
  },
  // Password reveal toggle: 44x44 minimum, per accessibility guidance.
  revealHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.xs,
    flexShrink: 0,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  errorText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.error,
    lineHeight: 16,
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});
