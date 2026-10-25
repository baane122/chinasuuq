import { COLORS } from "@/lib/theme";

export type PasswordLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  /** 0..5 raw score. */
  score: number;
  level: PasswordLevel;
  /** 1..4 filled segments for the meter UI. */
  segments: number;
  /** Theme token — never a hex literal. */
  color: string;
}

/**
 * Live password strength for the signup meter. Colors come from theme tokens
 * (error / warning / info / success) instead of hardcoded hex.
 */
export function passwordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) {
    return { score, level: "weak", segments: 1, color: COLORS.error };
  }
  if (score <= 2) {
    return { score, level: "fair", segments: 2, color: COLORS.warning };
  }
  if (score <= 3) {
    return { score, level: "good", segments: 3, color: COLORS.info };
  }
  return { score, level: "strong", segments: 4, color: COLORS.success };
}

/**
 * Normalize a Somali phone number to E.164 (+252…), or null if it is not a
 * recognizable Somali mobile number. Accepts:
 *   +252 61 234 5678 / 252612345678 / 00252612345678 / 0612345678 / 07… / 08…
 */
export function normalizeSomaliPhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/^\+/, "").replace(/^00/, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("252")) {
    const rest = digits.slice(3);
    return /^[678]\d{6,8}$/.test(rest) ? `+252${rest}` : null;
  }
  if (/^0[678]\d{6,8}$/.test(digits)) {
    return `+252${digits.slice(1)}`;
  }
  return null;
}
