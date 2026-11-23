// Colour themes you can buy with coins. Soft, low-glare palettes.
// `live` is the colour of a live cell; `on-accent` is text on accent buttons.
export const THEMES = [
  { id: "classic", name: "Classic", price: 0,
    vars: { bg: "#131519", panel: "#1b1e24", raised: "#23272f", line: "#2d323b", live: "#ebe7df", born: "#e5c07b", die: "#e07b6a", survive: "#8cc09a", accent: "#8aa4f4", accent2: "#b49bdc", "on-accent": "#12151b" } },
  { id: "dusk", name: "Dusk", price: 60,
    vars: { bg: "#15131c", panel: "#1d1a27", raised: "#262233", line: "#332e43", live: "#ece6f5", born: "#f0c987", die: "#ee8a9a", survive: "#8fd0b8", accent: "#b39cf2", accent2: "#f2a7c9", "on-accent": "#16121f" } },
  { id: "ocean", name: "Ocean", price: 120,
    vars: { bg: "#0f171c", panel: "#152129", raised: "#1c2b35", line: "#263a46", live: "#e3eef2", born: "#ecc77d", die: "#ee8f80", survive: "#7fcbb8", accent: "#7cc3e6", accent2: "#a3b7f0", "on-accent": "#0d1a21" } },
  { id: "forest", name: "Forest", price: 200,
    vars: { bg: "#121714", panel: "#19201b", raised: "#212a23", line: "#2c372e", live: "#ebeadf", born: "#dcc27a", die: "#d98a72", survive: "#a3c98a", accent: "#9bc59d", accent2: "#c8b48a", "on-accent": "#121812" } },
  { id: "paper", name: "Paper", price: 300, light: true,
    vars: { bg: "#f3efe7", panel: "#fbf8f2", raised: "#ebe5da", line: "#ddd5c6", live: "#3a3733", born: "#c9971f", die: "#c8614e", survive: "#4f9a6a", accent: "#4f6fc4", accent2: "#8a68b8", "on-accent": "#fbf8f2" } },
];

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty("--" + k, v);
  root.style.colorScheme = t.light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.vars.bg);
}
