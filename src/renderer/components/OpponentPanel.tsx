import { CircleHelp, Flame, Hand, ShieldQuestion, Swords, Timer } from "lucide-react";
import type { OpponentOverview, OpponentPlayedCard } from "../types";
import { CardDetailBody } from "./CardDetailBody";

interface OpponentPanelProps {
  overview: OpponentOverview;
  playedCards: OpponentPlayedCard[];
}

export function OpponentPanel({ overview, playedCards }: OpponentPanelProps) {
  return (
    <aside className="panel opponent-panel" aria-label="对手概览">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">对手</span>
          <h2>{overview.heroClass}</h2>
        </div>
        <div className="panel-icon danger">
          <CircleHelp aria-hidden="true" size={20} />
        </div>
      </div>

      <div className="overview-grid" aria-label="对手回合概览">
        <StatTile icon={Timer} label="当前回合" value={overview.currentTurn.toString()} />
        <StatTile icon={Hand} label="手牌" value={overview.handSize.toString()} />
        <StatTile icon={Swords} label="牌库" value={overview.deckRemaining.toString()} />
        <StatTile icon={ShieldQuestion} label="奥秘" value={overview.secretsInPlay.toString()} />
      </div>

      <div className="fatigue-block">
        <Flame aria-hidden="true" size={18} />
        <span>疲劳伤害</span>
        <strong>{overview.fatigueDamage}</strong>
      </div>

      <section className="last-action" aria-label="对手最近动作">
        <span>最近动作</span>
        <p>{overview.lastAction}</p>
      </section>

      <section aria-label="对手已出牌">
        <div className="subheading">
          <h3>已出牌</h3>
          <span>{playedCards.reduce((total, card) => total + card.count, 0)} 张</span>
        </div>
        <ul className="played-list">
          {playedCards.length === 0 ? (
            <li className="empty-state" role="status">
              <Swords aria-hidden="true" size={18} />
              <strong>暂无对手出牌</strong>
              <span>识别到对手打牌后会自动记录。</span>
            </li>
          ) : playedCards.map((card) => (
            <li key={card.id}>
              <details className="card-detail-disclosure">
                <summary className="played-card-row">
                  {card.details?.cropImageUrl || card.details?.imageUrl ? (
                    <img className="card-thumb" src={card.details.cropImageUrl ?? card.details.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="mana-cost">{card.cost ?? "—"}</span>
                  )}
                  <div>
                    <strong title={card.name} aria-label={card.name}>{card.name}</strong>
                    <small>
                      回合 {card.turn}
                      {card.details?.attack !== undefined && card.details.health !== undefined
                        ? ` · ${card.details.attack}/${card.details.health}`
                        : ""}
                    </small>
                  </div>
                  <em>x{card.count}</em>
                </summary>
                <CardDetailBody details={card.details} mode="interactive" />
              </details>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

interface StatTileProps {
  icon: typeof Timer;
  label: string;
  value: string;
}

function StatTile({ icon: Icon, label, value }: StatTileProps) {
  return (
    <div className="stat-tile">
      <Icon aria-hidden="true" size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
