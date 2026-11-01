"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  choices: readonly Choice<T>[];
}

export function ChoiceGroup<T extends string>({
  legend,
  value,
  onChange,
  choices,
}: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-cova-ink">{legend}</legend>
      <div className="space-y-2">
        {choices.map((c) => {
          const selected = c.value === value;
          return (
            <label
              key={c.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                selected ? "border-cova-ink bg-cova-pale" : "border-cova-line hover:bg-cova-pale",
              )}
            >
              <input
                type="radio"
                name={name}
                value={c.value}
                checked={selected}
                onChange={() => onChange(c.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{c.label}</span>
                {c.description && (
                  <span className="block text-xs text-cova-mute">{c.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
