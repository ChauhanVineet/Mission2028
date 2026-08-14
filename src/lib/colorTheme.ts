// Deterministic, playful color themes keyed off a label (e.g. subject name),
// so any subject the parent picks gets a consistent, vivid color without
// hardcoding subject names.
const THEMES = [
  {
    grad: "from-indigo-500 to-violet-500",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    border: "border-indigo-200",
    solid: "bg-indigo-600",
  },
  {
    grad: "from-rose-500 to-pink-500",
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    border: "border-rose-200",
    solid: "bg-rose-600",
  },
  {
    grad: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    border: "border-amber-200",
    solid: "bg-amber-500",
  },
  {
    grad: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    border: "border-emerald-200",
    solid: "bg-emerald-600",
  },
  {
    grad: "from-sky-500 to-cyan-500",
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
    border: "border-sky-200",
    solid: "bg-sky-600",
  },
] as const;

export type ColorTheme = (typeof THEMES)[number];

export function themeForLabel(label: string): ColorTheme {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return THEMES[hash % THEMES.length];
}
