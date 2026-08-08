import type { ArenaCardChoice } from "../../shared/types";

export function ArenaChoiceOverlayMetrics({ choice }: { readonly choice: ArenaCardChoice }) {
  const highWinLabel = choice.rating?.highWinThreshold
    ? `${choice.rating.highWinThreshold}+胜选取率`
    : "高胜选取率";

  return (
    <section className="arena-choice-metrics arena-choice-overlay-metrics" role="group" aria-label={`${choice.name} 的竞技场指标`}>
      <ImpactMetric label="抽到影响" value={choice.rating?.drawnImpact} />
      <ImpactMetric label="对套牌影响" value={choice.rating?.deckImpact} />
      <RateMetric label="选取率" value={choice.rating?.pickRate} />
      <RateMetric label={highWinLabel} value={choice.rating?.highWinPickRate} />
    </section>
  );
}

function ImpactMetric({ label, value }: { readonly label: "抽到影响" | "对套牌影响"; readonly value: number | undefined }) {
  return <Metric label={label} value={formatImpact(value)} tone={toImpactTone(value)} />;
}

function RateMetric({ label, value }: { readonly label: string; readonly value: number | undefined }) {
  return <Metric label={label} value={formatRate(value)} tone="is-neutral" />;
}

function Metric({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone: ImpactTone }) {
  return (
    <div className={`arena-choice-metric ${tone}`} role="group" aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type ImpactTone = "is-positive" | "is-negative" | "is-neutral";

function toImpactTone(value: number | undefined): ImpactTone {
  if (!isFiniteNumber(value) || value === 0) {
    return "is-neutral";
  }
  return value > 0 ? "is-positive" : "is-negative";
}

function formatImpact(value: number | undefined): string {
  return isFiniteNumber(value) ? value.toFixed(2) : "暂无";
}

function formatRate(value: number | undefined): string {
  return isFiniteNumber(value) ? `${value.toFixed(1)}%` : "暂无";
}

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
