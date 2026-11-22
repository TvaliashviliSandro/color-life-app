// Colour themes you can buy with coins. `live` is the colour of a live cell.
export const THEMES = [
  { id: "classic", name: "Classic", price: 0,
    vars: { bg: "#0f1115", panel: "#171a21", raised: "#1f2430", line: "#2a2f3a", live: "#e6e9f0", born: "#facc15", die: "#ef4444", survive: "#22c55e", accent: "#3b82f6" } },
  { id: "neon", name: "Neon", price: 60,
    vars: { bg: "#07060f", panel: "#110f22", raised: "#1a1733", line: "#2b2650", live: "#f5f3ff", born: "#fde047", die: "#ff2e88", survive: "#2dfcb4", accent: "#a855f7" } },
  { id: "ocean", name: "Ocean", price: 120,
    vars: { bg: "#06131c", panel: "#0b1f2c", raised: "#11293a", line: "#1b3a50", live: "#e0f2fe", born: "#fcd34d", die: "#fb7185", survive: "#2dd4bf", accent: "#0ea5e9" } },
  { id: "sunset", name: "Sunset", price: 200,
    vars: { bg: "#1a0f14", panel: "#26141c", raised: "#331b26", line: "#4a2735", live: "#fff1e6", born: "#ffd166", die: "#ef476f", survive: "#06d6a0", accent: "#f97316" } },
  { id: "paper", name: "Paper", price: 300, light: true,
    vars: { bg: "#f5f1e8", panel: "#fffdf8", raised: "#ece6d8", line: "#d8cfbd", live: "#2b2a28", born: "#e0a800", die: "#d64545", survive: "#2f9e44", accent: "#3b5bdb" } },
];

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty("--" + k, v);
  root.style.colorScheme = t.light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.vars.bg);
}
