import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "var(--ink)", paper: "var(--paper)", surface: "var(--surface)", sidebar: "var(--sidebar)", "sidebar-surface": "var(--sidebar-surface)", accent: "var(--accent)", "accent-hover": "var(--accent-hover)", "accent-tint": "var(--accent-tint)", "accent-tint-dark": "var(--accent-tint-dark)", muted: "var(--muted)", "text-secondary": "var(--text-secondary)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)" }, fontFamily: { display: ["var(--font-display)"], sans: ["var(--font-sans)"], mono: ["var(--font-mono)"] } } },
  plugins: []
};
export default config;
