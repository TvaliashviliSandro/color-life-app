// Appearance (free): System, Light, Dark. Colour themes (unlock with coins) come after.
// `live` is the colour of a live cell; `on-accent` is text on accent buttons.
const DARK = { bg: "#131519", panel: "#1b1e24", raised: "#23272f", line: "#2d323b", live: "#ebe7df", born: "#e5c07b", die: "#e07b6a", survive: "#8cc09a", accent: "#8aa4f4", accent2: "#b49bdc", "on-accent": "#12151b" };
const LIGHT = { bg: "#eef0f3", panel: "#ffffff", raised: "#e6e9ee", line: "#d6dae1", live: "#2c3038", born: "#dea53a", die: "#df6f5c", survive: "#55a97b", accent: "#4f6fd8", accent2: "#8a67cf", "on-accent": "#ffffff" };

export const APPEARANCES = [
  { id: "system", name: "System", icon: "auto" },
  { id: "light", name: "Light", icon: "sun", vars: LIGHT, light: true },
  { id: "dark", name: "Dark", icon: "moon", vars: DARK },
];

export const THEMES = [
  { id: "dusk", name: "Dusk", price: 300,
    vars: { bg: "#15131c", panel: "#1d1a27", raised: "#262233", line: "#332e43", live: "#ece6f5", born: "#f0c987", die: "#ee8a9a", survive: "#8fd0b8", accent: "#b39cf2", accent2: "#f2a7c9", "on-accent": "#16121f" } },
  { id: "ocean", name: "Ocean", price: 600,
    vars: { bg: "#0f171c", panel: "#152129", raised: "#1c2b35", line: "#263a46", live: "#e3eef2", born: "#ecc77d", die: "#ee8f80", survive: "#7fcbb8", accent: "#7cc3e6", accent2: "#a3b7f0", "on-accent": "#0d1a21" } },
  { id: "forest", name: "Forest", price: 900,
    vars: { bg: "#121714", panel: "#19201b", raised: "#212a23", line: "#2c372e", live: "#ebeadf", born: "#dcc27a", die: "#d98a72", survive: "#a3c98a", accent: "#9bc59d", accent2: "#c8b48a", "on-accent": "#121812" } },
];

export const FREE = APPEARANCES.map((a) => a.id);
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
let currentId = "system";

function resolve(id) {
  if (id === "system") return darkQuery && !darkQuery.matches ? APPEARANCES[1] : APPEARANCES[2];
  return APPEARANCES.find((a) => a.id === id) || THEMES.find((t) => t.id === id) || APPEARANCES[2];
}

export function applyTheme(id) {
  currentId = id;
  const t = resolve(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty("--" + k, v);
  root.style.colorScheme = t.light ? "light" : "dark";
  root.dataset.mode = t.light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.vars.bg);
}

// "System" follows the phone's setting live.
darkQuery?.addEventListener?.("change", () => { if (currentId === "system") applyTheme("system"); });

// The colours a theme shows in its preview swatch.
export const previewVars = (id) => resolve(id).vars;
