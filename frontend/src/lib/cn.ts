// Tiny classname joiner (clsx-style) — no external dependency.
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...parts: ClassValue[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (Array.isArray(p)) {
      const inner = cn(...p);
      if (inner) out.push(inner);
    } else {
      out.push(String(p));
    }
  }
  return out.join(" ");
}
