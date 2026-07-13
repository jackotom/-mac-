import type { ArenaCardChoice } from "../../shared/types";

type MetricLabel = "评分" | "选取率" | "胜率" | "12胜率" | "高胜数据" | "高胜选取" | `${number}+胜选取`;

interface ArenaChoiceMetricsProps {
  readonly choice: Pick<ArenaCardChoice, "name" | "score" | "rating">;
  readonly className?: string;
}

export function ArenaChoiceMetrics({ choice, className }: ArenaChoiceMetricsProps) {
  const score = choice.rating?.hearthArena ?? choice.score;
  const pickRate = choice.rating?.pickRate;
  const winRate = choice.rating?.firestone?.playedWinrate ?? choice.rating?.firestone?.includedWinrate;
  const highWinValue = choice.rating?.twelveWinRate ?? choice.rating?.highWinPickRate;
  const highWinLabel = toHighWinLabel(choice.rating?.twelveWinRate, choice.rating?.highWinPickRate, choice.rating?.highWinThreshold);

  return (
    <section className={["arena-choice-metrics", className].filter(Boolean).join(" ")} aria-label={`${choice.name} 的竞技场指标`} role="group">
      <Metric label="评分" value={formatScore(score)} />
      <Metric label={pickRate === undefined && winRate !== undefined ? "胜率" : "选取率"} value={formatPercent(pickRate ?? winRate)} />
      <Metric label={highWinLabel} value={formatPercent(highWinValue)} />
    </section>
  );
}

function Metric({ label, value }: { label: MetricLabel; value: string }) {
  return (
    <div className="arena-choice-metric" role="group" aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toHighWinLabel(twelveWinRate: number | undefined, highWinPickRate: number | undefined, highWinThreshold: number | undefined): MetricLabel {
  if (twelveWinRate !== undefined) {
    return "12胜率";
  }
  if (highWinPickRate === undefined) {
    return "高胜数据";
  }
  return highWinThreshold === undefined ? "高胜选取" : `${highWinThreshold}+胜选取`;
}

function formatScore(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "暂无" : Math.round(value).toString();
}

function formatPercent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "暂无" : `${value.toFixed(1)}%`;
}
