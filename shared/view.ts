export type StandardView = "iso" | "front" | "back" | "left" | "right" | "top" | "bottom";

export function displayViewName(name: string): string {
  const cleaned = name.replace(/,?\s*solid edge\s*$/i, "").trim();
  return cleaned || name;
}

export function configNameError(name: string): string | null {
  const cleaned = name.trim();
  if (!cleaned) return "Serve un nome.";
  if (cleaned.length > 80) return "Il nome è troppo lungo.";
  return null;
}
