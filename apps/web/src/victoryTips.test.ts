import { describe, expect, it } from "vitest";

import { victoryTipsForRole } from "./victoryTips";

describe("victoryTipsForRole", () => {
  it("uses different spymaster guidance for first-hand red and second-hand blue", () => {
    const red = victoryTipsForRole("red_spymaster");
    const blue = victoryTipsForRole("blue_spymaster");

    expect(red.title).toBe("红队队长获胜技巧");
    expect(blue.title).toBe("蓝队队长获胜技巧");
    expect(red.tips).not.toEqual(blue.tips);
    expect(red.tips.join("")).toContain("先手");
    expect(blue.tips.join("")).toContain("后手");
  });

  it("uses different operative guidance for first-hand red and second-hand blue", () => {
    const red = victoryTipsForRole("red_operatives");
    const blue = victoryTipsForRole("blue_operatives");

    expect(red.title).toBe("红队队员获胜技巧");
    expect(blue.title).toBe("蓝队队员获胜技巧");
    expect(red.tips).not.toEqual(blue.tips);
    expect(red.tips.join("")).toContain("先手");
    expect(blue.tips.join("")).toContain("后手");
  });
});
