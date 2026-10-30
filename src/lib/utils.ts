export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Formats an ISO date or timestamp using the browser's current locale. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole local calendar days from today to the given date. Negative means overdue. */
export function daysUntil(iso: string): number {
  const due = new Date(iso);
  const today = new Date();
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = dueDay - todayDay;
  return Math.round(ms / 86_400_000);
}

export function dueLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d} days`;
}

export function matchesQuery(query: string, ...fields: Array<string | string[]>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.flat().some((f) => f.toLowerCase().includes(q));
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
