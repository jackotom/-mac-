import type { CardDetails } from "../../shared/cardDatabase";

export function CardDetailBody({ details, className }: { details?: CardDetails; className?: string }) {
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
        {details.relatedCards.length > 0 ? (
          <div className="card-related-list">
            <span>{details.isSpell ? "生成/关联法术" : "关联牌"}</span>
            <div className="card-related-cards">
              {details.relatedCards.map((card) => (
                <div className="card-related-card" key={card.dbfId}>
                  {card.cropImageUrl || card.imageUrl ? (
                    <img src={card.cropImageUrl ?? card.imageUrl} alt="" loading="eager" />
                  ) : null}
                  <div>
                    <strong title={card.name}>{card.name}</strong>
                    <small>
                      {card.manaCost === undefined ? "" : `${card.manaCost} 费`}
                      {card.cardType ? `${card.manaCost === undefined ? "" : " · "}${card.cardType}` : ""}
                    </small>
                    {card.text ? <p>{card.text}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {gameContextSections.map((section) => (
        <div className="card-related-list card-spell-history card-game-context" key={section.key}>
          <span>{section.title}（{section.cards.length}）</span>
          {section.cards.length > 0 ? (
            <div className="card-related-cards">
              {section.cards.map((card, index) => (
                <div className="card-related-card" key={`${card.cardId ?? card.dbfId}-${index}`}>
                  {card.cropImageUrl || card.imageUrl ? (
                    <img src={card.cropImageUrl ?? card.imageUrl} alt="" loading="eager" />
                  ) : null}
                  <div>
                    <strong title={card.name}>{card.name}</strong>
                    <small>
                      {card.manaCost === undefined ? "" : `${card.manaCost} 费`}
                      {card.cardType ? `${card.manaCost === undefined ? "" : " · "}${card.cardType}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-spell-history-empty">{section.emptyText}</div>
          )}
        </div>
      ))}
    </div>
  );
}
