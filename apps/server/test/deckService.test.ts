import { describe, expect, it, vi } from "vitest";

import { createFallbackDeck, generateAiDeck, validateWords } from "../src/deckService";

describe("deckService", () => {
  it("validates 25 unique chinese words", () => {
    const words = Array.from({ length: 25 }, (_, index) => `词条${index}`);
    expect(() => validateWords(words)).toThrow();
  });

  it("rejects duplicate words", () => {
    const words = Array.from({ length: 25 }, () => "海洋");
    expect(() => validateWords(words)).toThrow(/duplicate/i);
  });

  it("falls back when client is absent", async () => {
    const deck = await generateAiDeck();
    expect(deck.mode).toBe("fallback");
    expect(deck.contents).toHaveLength(25);
  });

  it("uses parsed response when available", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  parsed: {
                    cards: [
                      "火山", "桥梁", "雨伞", "灯塔", "雪山", "车站", "草原", "海浪", "茶杯", "图书",
                      "窗帘", "手套", "钟楼", "信封", "船锚", "风铃", "森林", "电梯", "花园", "围巾",
                      "地图", "帐篷", "面包", "沙漠", "河流",
                    ],
                  },
                },
              ],
            },
          ],
        }),
      },
    };

    const deck = await generateAiDeck(fakeClient as never);
    expect(deck.mode).toBe("ai");
    expect(deck.contents).toHaveLength(25);
  });

  it("creates fallback deck from local words", () => {
    const deck = createFallbackDeck();
    expect(deck.contents[0]?.text).toBeTruthy();
  });

  it("creates a 25-card fallback image deck with unique alt text", () => {
    const deck = createFallbackDeck("image");
    const alts = deck.contents.map((card) => (card.type === "image" ? card.alt : ""));

    expect(deck.contents).toHaveLength(25);
    expect(deck.contents.every((card) => card.type === "image")).toBe(true);
    expect(new Set(alts).size).toBe(25);
  });
});
