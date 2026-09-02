import type { TextStyle, ViewStyle } from "react-native";

export type WeNitroColorMode = "light" | "dark";

export const brand = {
  primary: "#1910C2",
  vibrant: "#4E46E5",
  deep: "#10077F",
  soft: "#EFEEFF",
  gradient: ["#1F16C6", "#4E46E5"] as const,
} as const;

const neutral = {
  white: "#FFFFFF",
  25: "#FCFCFD",
  50: "#F7F7F9",
  100: "#EFEFF3",
  200: "#E1E1E8",
  300: "#C8C8D2",
  400: "#9292A0",
  500: "#686876",
  600: "#4A4A57",
  700: "#32323C",
  800: "#202028",
  900: "#141419",
  950: "#0B0B0F",
} as const;

export const palette = {
  brand,
  neutral,
  success: "#15803D",
  successSoft: "#EAF8EF",
  warning: "#B45309",
  warningSoft: "#FFF5E5",
  danger: "#C62828",
  dangerSoft: "#FDECEC",
  info: "#1668DC",
  infoSoft: "#EAF2FF",
  transparent: "transparent",
  scrim: "rgba(5, 5, 10, 0.56)",
} as const;

export const lightColors = {
  background: neutral[50],
  surface: neutral.white,
  surfaceRaised: neutral.white,
  surfaceSubtle: neutral[100],
  surfacePressed: neutral[200],
  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textTertiary: neutral[500],
  textInverse: neutral.white,
  border: neutral[200],
  borderStrong: neutral[300],
  divider: neutral[100],
  icon: neutral[700],
  iconMuted: neutral[500],
  primary: brand.primary,
  primaryPressed: brand.deep,
  primarySoft: brand.soft,
  focusRing: brand.vibrant,
  success: palette.success,
  successSoft: palette.successSoft,
  warning: palette.warning,
  warningSoft: palette.warningSoft,
  danger: palette.danger,
  dangerSoft: palette.dangerSoft,
  info: palette.info,
  infoSoft: palette.infoSoft,
  scrim: palette.scrim,
} as const;

export const darkColors = {
  background: neutral[950],
  surface: neutral[900],
  surfaceRaised: neutral[800],
  surfaceSubtle: "#292932",
  surfacePressed: neutral[700],
  textPrimary: neutral[25],
  textSecondary: neutral[300],
  textTertiary: neutral[400],
  textInverse: neutral[950],
  border: neutral[700],
  borderStrong: neutral[600],
  divider: neutral[800],
  icon: neutral[100],
  iconMuted: neutral[400],
  primary: "#7771FF",
  primaryPressed: "#928EFF",
  primarySoft: "#27235F",
  focusRing: "#8C87FF",
  success: "#4ADE80",
  successSoft: "#133522",
  warning: "#FBBF24",
  warningSoft: "#3B2B0E",
  danger: "#FF6B6B",
  dangerSoft: "#421B1B",
  info: "#69A7FF",
  infoSoft: "#172D50",
  scrim: "rgba(0, 0, 0, 0.72)",
} as const;

export type ThemeColors = typeof lightColors | typeof darkColors;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
} as const;

const fontFamily = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
} as const;

const text = (
  size: number,
  lineHeight: number,
  family: keyof typeof fontFamily,
): TextStyle => ({
  fontFamily: fontFamily[family],
  fontSize: size,
  lineHeight,
  letterSpacing: 0,
});

export const typography = {
  fontFamily,
  display: text(32, 40, "extrabold"),
  heading1: text(28, 36, "bold"),
  heading2: text(24, 32, "bold"),
  heading3: text(20, 28, "bold"),
  title: text(18, 26, "semibold"),
  bodyLarge: text(16, 24, "regular"),
  body: text(14, 21, "regular"),
  bodyMedium: text(14, 21, "medium"),
  label: text(13, 18, "semibold"),
  caption: text(12, 17, "regular"),
  overline: text(11, 16, "bold"),
  button: text(15, 20, "semibold"),
} as const;

export const iconSizes = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
} as const;

export const controlSizes = {
  iconButton: 44,
  input: 48,
  button: 48,
  buttonCompact: 40,
  bottomNavigation: 64,
  touchTargetMinimum: 44,
} as const;

export const shadows = {
  none: {} as ViewStyle,
  subtle: {
    shadowColor: neutral[950],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  } satisfies ViewStyle,
  card: {
    shadowColor: neutral[950],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  } satisfies ViewStyle,
  overlay: {
    shadowColor: neutral[950],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  } satisfies ViewStyle,
} as const;

export const motion = {
  duration: {
    instant: 0,
    fast: 120,
    standard: 220,
    deliberate: 360,
    sheet: 420,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    enter: [0, 0, 0, 1] as const,
    exit: [0.3, 0, 1, 1] as const,
  },
  scale: {
    pressed: 0.97,
    selected: 1.02,
  },
} as const;

export const layout = {
  screenHorizontalPadding: spacing[4],
  screenMaxWidth: 720,
  contentGap: spacing[4],
  sectionGap: spacing[6],
  hairline: 1,
} as const;

export const zIndex = {
  content: 0,
  sticky: 10,
  navigation: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;

export function createTheme(mode: WeNitroColorMode) {
  return {
    mode,
    colors: mode === "dark" ? darkColors : lightColors,
    palette,
    spacing,
    radii,
    typography,
    iconSizes,
    controlSizes,
    shadows,
    motion,
    layout,
    zIndex,
  } as const;
}

export type WeNitroTheme = ReturnType<typeof createTheme>;

export const themes = {
  light: createTheme("light"),
  dark: createTheme("dark"),
} as const;
