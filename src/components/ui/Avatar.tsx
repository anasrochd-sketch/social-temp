import type { Tone } from "@/types";
import { cn, initials } from "@/lib/utils";

const toneClass: Record<Tone, string> = {
  pale: "bg-cova-pale",
  soft: "bg-cova-soft",
  muted: "bg-cova-muted",
};

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

interface AvatarProps {
  name: string;
  /** Photo URL (profile avatar). Falls back to the initials when absent. */
  src?: string | null;
  tone?: Tone;
  size?: keyof typeof sizeClass;
  className?: string;
}

export function Avatar({ name, src, tone = "soft", size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-cova-ink",
        toneClass[tone],
        sizeClass[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are public storage URLs served already sized
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
