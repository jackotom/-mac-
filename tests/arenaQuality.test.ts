import { describe, expect, it } from "vitest";
import { getArenaScoreQuality } from "../src/shared/arenaRatings";

describe("arena score quality", () => {
  it.each([
    [145, "s", "顶级"],
    [110, "a", "优秀"],
    [105, "b", "良好"],
    [70, "c", "一般"],
    [40, "d", "偏弱"],
    [39, "f", "不推荐"],
    [undefined, "unknown", "暂无评分"]
  ])("maps %s to a readable quality", (score, tier, label) => {
    expect(getArenaScoreQuality(score)).toEqual({ tier, label });
  });
});
