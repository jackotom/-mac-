import type { ArenaState } from "../../shared/types";
import { ArenaChoiceOverlayMetrics } from "./ArenaChoiceOverlayMetrics";

interface ArenaChoiceOverlayPanelProps {
  readonly arena?: ArenaState;
}

export function ArenaChoiceOverlayPanel({ arena }: ArenaChoiceOverlayPanelProps) {
  const choices = arena?.status === "drafting" || arena?.status === "redrafting" ? arena.currentChoices.slice(0, 3) : [];
  const isVisible = choices.length >= 2;
  const slots = Array.from({ length: 3 }, (_, screenSlot) =>
    choices.find((choice, index) => (choice.screenSlot ?? index) === screenSlot)
  );

  return (
    <section
      className="arena-choice-overlay-shell"
      aria-label="竞技场选牌数据条"
      aria-hidden={!isVisible}
      data-visible={isVisible ? "true" : "false"}
    >
      {isVisible
        ? slots.map((choice, index) => (
            <article className="arena-choice-overlay-card" key={choice ? `${choice.cardId ?? choice.name}-${choice.entityId ?? index}` : `pending-${index}`}>
              {choice ? (
                <ArenaChoiceOverlayMetrics choice={choice} />
              ) : (
                <div className="arena-choice-overlay-pending" role="status">识别中</div>
              )}
            </article>
          ))
        : null}
    </section>
  );
}
