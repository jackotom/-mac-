import type { ArenaState } from "../../shared/types";
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
              <ArenaChoiceMetrics choice={choice} className="arena-choice-overlay-metrics" />
            </article>
          ))
        : null}
    </section>
  );
}
