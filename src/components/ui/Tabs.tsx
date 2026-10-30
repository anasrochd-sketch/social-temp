"use client";

import { cn } from "@/lib/utils";

interface TabsProps<T extends string> {
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  counts?: Partial<Record<T, number>>;
  labels?: Partial<Record<T, string>>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label, counts, labels }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-lg bg-cova-pale p-1"
    >
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-white text-cova-ink" : "text-cova-ink/75 hover:text-cova-ink",
            )}
          >
            {labels?.[tab] ?? tab}
            {counts?.[tab] !== undefined && (
              <span className="ml-1.5 text-xs text-cova-mute">{counts[tab]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
