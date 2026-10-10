import identity from "../../../../../packages/brand/v1.1/identity.tokens.json";

export const colors = identity.palette;
export const colorRoles = {
  canvas: colors.paper,
  surface: colors.surface,
  text: colors.ink,
  secondaryText: colors.muted,
  heading: colors.forest,
  action: colors.forest,
  onAction: colors.paper,
  accentText: colors.rustText,
  bookStamp: colors.rustText,
  decorativeAccent: colors.terracotta,
  inputBorder: colors.border,
  divider: colors.rule,
  focus: colors.forest,
  scrim: "rgba(20,36,28,.45)",
  shelfCanvas: "#F6F8F3",
  shelfEdge: "#B5C3AC",
  navigationBackground: colors.surface,
  navigationText: colors.muted,
  navigationSelected: colors.successSurface,
  navigationSelectedText: colors.forest,
  navigationFocus: colors.forest,
} as const;
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  page: 40,
} as const;
export const radius = {
  book: 2,
  record: 4,
  small: 4,
  card: 6,
  control: 8,
  sheet: 20,
  pill: 24,
} as const;
export const metrics = {
  touch: 48,
  control: 52,
  content: 480,
  shelfCover: 196,
  sheet: 520,
} as const;
export const typography = {
  // One bundled family for Vietnamese tasks; use the actual regular/bold faces.
  bookTitle: [22, 30, "BeBold"],
  bookHeading: [20, 28, "BeBold"],
  searchTitle: [28, 36, "BeBold"],
  shelfTitle: [16, 23, "BeBold"],
  shelfPrice: [18, 25, "BeBold"],
  reading: [16, 25, "BeRegular"],
  annotation: [14, 21, "BeRegular"],
  stamp: [14, 21, "BeBold"],
  bookPrice: [20, 28, "BeBold"],
  body: [15, 24, "BeRegular"],
  small: [12, 19, "BeRegular"],
  label: [11, 17, "BeBold"],
  navigationLabel: [12, 18, "BeBold"],
  title: [32, 43, "BeBold"],
  heading: [23, 32, "BeBold"],
  card: [17, 24, "BeBold"],
  bold: [15, 24, "BeBold"],
  price: [21, 29, "BeBold"],
} as const;
export const feedbackColors = {
  error: { text: colors.error, surface: colors.errorSurface },
  warning: { text: colors.warning, surface: colors.warningSurface },
  success: { text: colors.success, surface: colors.successSurface },
  info: { text: colors.info, surface: colors.infoSurface },
} as const;
