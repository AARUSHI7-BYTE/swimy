export type ThemeMode = "light" | "dark";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  icon: string;
  statusBar: "light" | "dark";
};

export const lightColors: ThemeColors = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f5f6f9",
  border: "#eceef2",
  text: "#151923",
  textMuted: "#5d6472",
  textFaint: "#9ba1ad",
  primary: "#2850e8",
  primarySoft: "#eaf0ff",
  success: "#1fb46a",
  successSoft: "#e6f8ee",
  danger: "#df4545",
  dangerSoft: "#fbe9e9",
  warning: "#c98a1f",
  warningSoft: "#fbf1de",
  icon: "#7f8797",
  statusBar: "dark",
};

export const darkColors: ThemeColors = {
  background: "#0e1016",
  surface: "#181b24",
  surfaceAlt: "#20232e",
  border: "#2b2f3b",
  text: "#f2f3f6",
  textMuted: "#a3a9b6",
  textFaint: "#767c8a",
  primary: "#5b7fff",
  primarySoft: "#232a45",
  success: "#37d489",
  successSoft: "#173428",
  danger: "#ff6b6b",
  dangerSoft: "#3a1f21",
  warning: "#e0ab4c",
  warningSoft: "#3a2f18",
  icon: "#a3a9b6",
  statusBar: "light",
};

export function colorsFor(mode: ThemeMode): ThemeColors {
  return mode === "dark" ? darkColors : lightColors;
}
