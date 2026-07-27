import { Trophy } from "lucide-react";
import type { ArenaHeroWinRateRankingResult } from "../../shared/arenaHeroStats";

export function ArenaHeroWinRateRankingPanel({
  result,
  isLoading = false,
  onClose
}: {
  result?: ArenaHeroWinRateRankingResult;
  isLoading?: boolean;
  onClose?: () => void;
}) {
  const entries = result?.status === "ok" ? result.entries : [];

  return (
    <section className="arena-hero-ranking" aria-label="竞技场英雄胜率排行">
      <header className="arena-hero-ranking__header">
        <span className="arena-hero-ranking__icon" aria-hidden="true"><Trophy size={17} /></span>
        <div>
          <h1>竞技场英雄胜率</h1>
          <p>{result?.status === "ok" ? `${result.source} · ${formatUpdatedAt(result.updatedAt)}` : "当前版本公开数据"}</p>
        </div>
        {onClose ? <button type="button" aria-label="关闭竞技场英雄胜率排行" onClick={onClose}>×</button> : null}
      </header>

      {isLoading ? (
        <p className="arena-hero-ranking__message" role="status">正在读取排行…</p>
      ) : result?.status === "unavailable" || result?.status === "error" ? (
        <p className="arena-hero-ranking__message is-error" role="alert">{result.message}</p>
      ) : entries.length === 0 ? (
        <p className="arena-hero-ranking__message" role="status">暂无可信排行数据</p>
      ) : (
        <ol className="arena-hero-ranking__list">
          {entries.map((entry) => (
            <li key={`${entry.heroClass}-${entry.heroName}`}>
              <strong className="arena-hero-ranking__rank">{entry.rank}</strong>
              <span className="arena-hero-ranking__hero">
                <b>{entry.heroName}</b>
                {formatHeroClass(entry.heroClass, entry.heroName) ? <small>{formatHeroClass(entry.heroClass, entry.heroName)}</small> : null}
              </span>
              <span className="arena-hero-ranking__sample">{formatGames(entry.games)} 场</span>
              <strong className="arena-hero-ranking__rate">{entry.winRate.toFixed(1)}%</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  return `更新于 ${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`;
}

function formatGames(games: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: games >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(games);
}

const localizedHeroClasses: Readonly<Record<string, string>> = {
  DEATHKNIGHT: "死亡骑士",
  DEMONHUNTER: "恶魔猎手",
  DRUID: "德鲁伊",
  HUNTER: "猎人",
  MAGE: "法师",
  PALADIN: "圣骑士",
  PRIEST: "牧师",
  ROGUE: "潜行者",
  SHAMAN: "萨满祭司",
  WARLOCK: "术士",
  WARRIOR: "战士"
};

function formatHeroClass(heroClass: string, heroName: string): string | undefined {
  const key = heroClass.replace(/[\s_-]/g, "").toUpperCase();
  const localized = localizedHeroClasses[key];
  if (!localized || localized === heroName) return undefined;
  return localized;
}
