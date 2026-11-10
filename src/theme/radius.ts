/**
 * Border radius values ("Midnight Blue").
 */

export const radius = {
  sm: 8,
  tile: 14, // inner tiles / inputs
  card: 20, // cards
  listGroup: 14, // grouped list containers (standard tier)
  button: 10, // CTA buttons (squared, not pills)
  chip: 6, // chips, tags, small toggles
  pill: 999, // progress tracks only; chips and buttons are squared
} as const;
