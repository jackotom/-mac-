import type { OverlayPublicMatchCounters } from "../types";

interface PublicMatchCountersProps {
  side: "friendly" | "opponent";
  counters?: OverlayPublicMatchCounters;
}

interface CounterDefinition {
  key: keyof OverlayPublicMatchCounters;
  label: string;
  shortLabel: string;
  className: string;
}

const counterDefinitions: readonly CounterDefinition[] = [
  { key: "nextFatigueDamage", label: "下次疲劳伤害", shortLabel: "疲劳", className: "fatigue" },
  { key: "corpses", label: "尸体", shortLabel: "尸体", className: "corpses" },
  { key: "spellsPlayed", label: "已用法术", shortLabel: "法术", className: "spells" }
];

export function PublicMatchCounters({ side, counters }: PublicMatchCountersProps) {
  const sideLabel = side === "friendly" ? "我方" : "对方";
  const visibleCounters = counterDefinitions.flatMap((definition) => {
    const value = counters?.[definition.key];
    return value === undefined ? [] : [{ ...definition, value }];
  });

  if (visibleCounters.length === 0) {
    return null;
  }

  return (
    <section
      className={`overlay-public-counters overlay-public-counters-${side}`}
      aria-label={`${sideLabel}公开计数`}
    >
      {visibleCounters.map(({ key, label, shortLabel, className, value }) => (
        <output
          key={key}
          className={`overlay-public-counter overlay-public-counter-${className}`}
          aria-label={`${sideLabel}${label} ${value}`}
          title={`${sideLabel}${label}`}
        >
          <span className="overlay-public-counter-label" aria-hidden="true">
            {shortLabel}
          </span>
          <strong className="overlay-public-counter-value">{value}</strong>
        </output>
      ))}
    </section>
  );
}
