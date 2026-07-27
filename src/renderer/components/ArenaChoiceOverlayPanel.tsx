import type { ArenaCardChoice, ArenaState } from "../../shared/types";
import { ArenaChoiceMetrics } from "./ArenaChoiceMetrics";

interface ArenaChoiceOverlayPanelProps {
  readonly arena?: ArenaState;
}

export function ArenaChoiceOverlayPanel({ arena }: ArenaChoiceOverlayPanelProps) {
  const choices = arena?.status === "drafting" || arena?.status === "redrafting" ? arena.currentChoices.slice(0, 3) : [];
  const isVisible = choices.length === 3;

  return (
    <section
      className="arena-choice-overlay-shell"
      aria-label="竞技场选牌数据条"
      aria-hidden={!isVisible}
      data-visible={isVisible ? "true" : "false"}
    >
      {isVisible
        ? choices.map((choice, index) => (
            <article className="arena-choice-overlay-card" key={`${choice.cardId ?? choice.name}-${choice.entityId ?? index}`}>
              {hasScorelessFirestoneRates(choice) ? (
                <ScorelessFirestoneMetrics choice={choice} />
              ) : (
                <ArenaChoiceMetrics choice={choice} className="arena-choice-overlay-metrics" />
              )}
            </article>
          ))
        : null}
    </section>
  );
}

function hasScorelessFirestoneRates(choice: ArenaCardChoice): boolean {
  return (
    choice.score === undefined &&
    choice.rating?.hearthArena === undefined &&
    choice.rating?.pickRate !== undefined &&
    choice.rating.firestone?.includedWinrate !== undefined
  );
}

function ScorelessFirestoneMetrics({ choice }: { readonly choice: ArenaCardChoice }) {
  const pickRate = choice.rating?.pickRate;
  const includedWinrate = choice.rating?.firestone?.includedWinrate;

  return (
    <section className="arena-choice-metrics arena-choice-overlay-metrics" role="group" aria-label={`${choice.name} 的竞技场指标`}>
      <div className="arena-choice-metric" role="group" aria-label="评分">
        <span>评分</span>
        <strong>暂无</strong>
      </div>
      <div className="arena-choice-metric" role="group" aria-label="入选胜率">
        <span>入选胜率</span>
        <strong>{includedWinrate?.toFixed(1)}%</strong>
      </div>
      <div className="arena-choice-metric" role="group" aria-label="选取率">
        <span>选取率</span>
        <strong>{pickRate?.toFixed(1)}%</strong>
      </div>
    </section>
  );
}
