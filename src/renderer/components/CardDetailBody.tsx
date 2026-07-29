import { useState, type ReactNode } from "react";
import type { CardDetails, CardOutcomeNode, RelatedCardInfo } from "../../shared/cardDatabase";

const CARD_POOL_BATCH_SIZE = 12;

interface CardDetailBodyProps {
  readonly details?: CardDetails;
  readonly className?: string;
  readonly mode: "summary" | "interactive";
}

export function CardDetailBody({ details, className, mode }: CardDetailBodyProps) {
  if (!details) {
    return <div className="card-detail-empty">暂无卡牌资料</div>;
  }

  const typeLabel = details.isSpell ? "法术" : details.cardType ?? "卡牌";
  const stats = [
    details.manaCost === undefined ? undefined : `费用 ${details.manaCost}`,
    !details.isSpell && details.attack !== undefined && details.attack > 0 ? `攻击 ${details.attack}` : undefined,
    !details.isSpell && details.health !== undefined && details.health > 0 ? `生命 ${details.health}` : undefined
  ].filter((value): value is string => value !== undefined);
  const playedSpells = details.playedSpellsThisGame;
  const cardPoolSections = details.cardPoolSections ?? [];
  const cardOutcomeSections = details.cardOutcomeSections ?? [];
  const gameContextSections = details.gameContextSections ?? (
    playedSpells === undefined
      ? []
      : [{
          key: "played-spells",
          title: "本局已施放法术",
          emptyText: "本局还没有施放过法术",
          cards: playedSpells
        }]
  );

  return (
    <div className={`card-detail-body${className ? ` ${className}` : ""}`}>
      {details.imageUrl || details.cropImageUrl ? (
        <img
          className="card-detail-image"
          src={details.imageUrl ?? details.cropImageUrl}
          alt={`${details.name} 卡牌图`}
          loading="eager"
          onError={(event) => {
            if (details.cropImageUrl && event.currentTarget.src !== details.cropImageUrl) {
              event.currentTarget.src = details.cropImageUrl;
              return;
            }

            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="card-detail-image card-detail-image-empty">无图片</div>
      )}
      <div className="card-detail-copy">
        <div className="card-detail-heading">
          <strong title={details.name}>{details.name}</strong>
          <span>{typeLabel}</span>
        </div>
        {stats.length > 0 ? <div className="card-detail-stats">{stats.join(" · ")}</div> : null}
        {details.spellSchool ? <div className="card-detail-meta">法术派系：{details.spellSchool}</div> : null}
        {details.text ? <p className="card-detail-text">{details.text}</p> : null}
      </div>
      <CardListSection
        cards={details.relatedCards}
        className="card-detail-related"
        emptyText={details.isSpell ? "暂无生成或关联法术资料" : "暂无关联牌资料"}
        title={details.isSpell ? "生成/关联法术" : "关联牌"}
        showText
      />
      {mode === "interactive" ? cardPoolSections.map((section) => (
        <CardPoolSection
          cards={section.cards}
          emptyText={section.emptyText}
          key={`${details.cardId ?? details.dbfId}:${section.key}`}
          title={section.title}
        />
      )) : null}
      {cardOutcomeSections.map((section) => (
        <CardOutcomeSection
          cards={section.cards}
          emptyText={section.emptyText}
          key={section.key}
          title={section.title}
        />
      ))}
      {gameContextSections.map((section) => (
        <CardListSection
          cards={section.cards}
          className="card-game-context"
          emptyText={section.emptyText}
          key={section.key}
          title={section.title}
        />
      ))}
    </div>
  );
}

function CardPoolSection({
  cards,
  emptyText,
  title
}: {
  readonly cards: readonly RelatedCardInfo[];
  readonly emptyText: string;
  readonly title: string;
}) {
  const [visibleCount, setVisibleCount] = useState(CARD_POOL_BATCH_SIZE);
  const visibleCards = cards.slice(0, visibleCount);
  const remainingCount = cards.length - visibleCards.length;
  const nextBatchCount = Math.min(CARD_POOL_BATCH_SIZE, remainingCount);

  return (
    <details className="card-related-list card-spell-history card-pool-section">
      <summary>{title}（{cards.length}）</summary>
      <div aria-label={`${title}，共 ${cards.length} 张`} role="region">
        {visibleCards.length > 0 ? (
          <div className="card-related-cards" role="list">
            {visibleCards.map((card, index) => (
              <RelatedCardRow
                card={card}
                key={`${card.cardId ?? card.dbfId}-${index}`}
                role="listitem"
                showText
              />
            ))}
          </div>
        ) : (
          <div className="card-spell-history-empty">{emptyText}</div>
        )}
        {remainingCount > 0 ? (
          <button
            className="card-pool-load-more"
            onClick={() => setVisibleCount((current) => current + CARD_POOL_BATCH_SIZE)}
            type="button"
          >
            继续显示 {nextBatchCount} 张（剩余 {remainingCount} 张）
          </button>
        ) : null}
      </div>
    </details>
  );
}

function CardListSection({
  cards,
  className,
  emptyText,
  footer,
  title,
  showText = false,
  totalCount = cards.length
}: {
  readonly cards: readonly RelatedCardInfo[];
  readonly className: string;
  readonly emptyText: string;
  readonly footer?: ReactNode;
  readonly title: string;
  readonly showText?: boolean;
  readonly totalCount?: number;
}) {
  return (
    <div
      aria-label={`${title}，共 ${totalCount} 张`}
      className={`card-related-list card-spell-history ${className}`}
      role="region"
    >
      <span>{title}（{totalCount}）</span>
      {cards.length > 0 ? (
        <div className="card-related-cards" role="list">
          {cards.map((card, index) => (
            <RelatedCardRow
              card={card}
              key={`${card.cardId ?? card.dbfId}-${index}`}
              role="listitem"
              showText={showText}
            />
          ))}
        </div>
      ) : (
        <div className="card-spell-history-empty">{emptyText}</div>
      )}
      {footer}
    </div>
  );
}

function CardOutcomeSection({
  cards,
  emptyText,
  title
}: {
  readonly cards: readonly CardOutcomeNode[];
  readonly emptyText: string;
  readonly title: string;
}) {
  return (
    <div
      aria-label={`${title}，共 ${cards.length} 张`}
      className="card-related-list card-spell-history card-outcome-section"
      role="region"
    >
      <span>{title}（{cards.length}）</span>
      {cards.length > 0 ? (
        <div className="card-outcome-tree" role="list">
          {cards.map((node) => <CardOutcomeNodeView key={node.key} node={node} />)}
        </div>
      ) : (
        <div className="card-spell-history-empty">{emptyText}</div>
      )}
    </div>
  );
}

function CardOutcomeNodeView({ node }: { readonly node: CardOutcomeNode }) {
  const children = node.children ?? [];
  const childLabel = `由「${node.card.name}」触发`;

  return (
    <div className="card-outcome-node" role="listitem">
      <RelatedCardRow card={node.card} />
      {children.length > 0 ? (
        <div
          aria-label={`${childLabel}，共 ${children.length} 张`}
          className="card-outcome-children"
          role="group"
        >
          <span>{childLabel}（{children.length}）</span>
          <div className="card-outcome-tree" role="list">
            {children.map((child) => <CardOutcomeNodeView key={child.key} node={child} />)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RelatedCardRow({
  card,
  role,
  showText = false
}: {
  readonly card: RelatedCardInfo;
  readonly role?: "listitem";
  readonly showText?: boolean;
}) {
  return (
    <div className="card-related-card" role={role}>
      <div className="card-related-art">
        {card.cropImageUrl || card.imageUrl ? (
          <img src={card.cropImageUrl ?? card.imageUrl} alt="" loading="eager" />
        ) : (
          <span aria-label={`${card.name}无卡图`}>无图</span>
        )}
      </div>
      <div>
        <strong title={card.name}>{card.name}</strong>
        <small>
          {card.manaCost === undefined ? "" : `${card.manaCost} 费`}
          {card.cardType ? `${card.manaCost === undefined ? "" : " · "}${card.cardType}` : ""}
        </small>
        {showText && card.text ? <p>{card.text}</p> : null}
      </div>
    </div>
  );
}
