import { describe, expect, it, vi } from "vitest";

import { createFallbackDeck, createImageDeckFromGrid, generateAiDeck, validateWords } from "../src/deckService";
import { fallbackWords } from "../src/fallbackWords";
import { GeneratedImageStore } from "../src/generatedImageStore";

const aiConfig = {
  provider: "openai" as const,
  apiKey: "sk-test",
  textModel: "gpt-5.4-mini",
  imageModel: "gpt-image-1.5",
};

describe("deckService", () => {
  it("validates 25 unique chinese words", () => {
    const words = Array.from({ length: 25 }, (_, index) => `词条${index}`);
    expect(() => validateWords(words)).toThrow();
  });

  it("rejects duplicate words", () => {
    const words = Array.from({ length: 25 }, () => "海洋");
    expect(() => validateWords(words)).toThrow(/duplicate/i);
  });

  it("falls back when AI config is absent", async () => {
    const deck = await generateAiDeck();
    expect(deck.mode).toBe("fallback");
    expect(deck.contents).toHaveLength(25);
  });

  it("uses parsed text response when AI config is present", async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    cards: [
                      "火山",
                      "桥梁",
                      "雨伞",
                      "灯塔",
                      "雪山",
                      "车站",
                      "草原",
                      "海浪",
                      "茶杯",
                      "图书",
                      "窗帘",
                      "手套",
                      "钟楼",
                      "信封",
                      "船锚",
                      "风铃",
                      "森林",
                      "电梯",
                      "花园",
                      "围巾",
                      "地图",
                      "帐篷",
                      "面包",
                      "沙漠",
                      "河流",
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    };

    const deck = await generateAiDeck({ mode: "text", aiConfig, textClient: fakeClient as never });
    expect(deck.mode).toBe("ai");
    expect(deck.contents).toHaveLength(25);
  });

  it("throws instead of falling back when configured AI text generation fails", async () => {
    const fakeClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("provider unavailable")),
        },
      },
    };

    await expect(generateAiDeck({ mode: "text", aiConfig, textClient: fakeClient as never })).rejects.toThrow("provider unavailable");
  });

  it("creates fallback deck from local words", () => {
    const deck = createFallbackDeck();
    const words = deck.contents.map((card) => (card.type === "word" ? card.text : ""));

    expect(deck.contents).toHaveLength(25);
    expect(deck.contents.every((card) => card.type === "word")).toBe(true);
    expect(new Set(words).size).toBe(25);
    expect(words.every((word) => fallbackWords.includes(word))).toBe(true);
  });

  it("keeps the local text word bank at 476 unique common entity words", () => {
    expect(fallbackWords).toHaveLength(476);
    expect(new Set(fallbackWords).size).toBe(476);
    expect(fallbackWords.every((word) => /^[\p{Script=Han}]{2,3}$/u.test(word))).toBe(true);
    expect(fallbackWords).toContain("网吧");
    expect(fallbackWords).toContain("航母");
    expect(fallbackWords).toContain("田地");
    expect(fallbackWords).toContain("大拇指");
    expect(fallbackWords).toContain("蜘蛛");
    expect(fallbackWords).toContain("电梯");
    expect(fallbackWords).toContain("花园");
    expect(fallbackWords).toContain("小汽车");
    expect(fallbackWords).toContain("红苹果");
    expect(fallbackWords).toContain("女医生");
  });

  it("randomizes local fallback words instead of taking the first 25 entries", () => {
    const deck = createFallbackDeck("text", () => 0.999999);
    const words = deck.contents.map((card) => (card.type === "word" ? card.text : ""));

    expect(words).toHaveLength(25);
    expect(new Set(words).size).toBe(25);
    expect(words).not.toEqual(fallbackWords.slice(0, 25));
  });

  it("creates a 25-card fallback image deck with unique alt text", () => {
    const deck = createFallbackDeck("image");
    const alts = deck.contents.map((card) => (card.type === "image" ? card.alt : ""));

    expect(deck.contents).toHaveLength(25);
    expect(deck.contents.every((card) => card.type === "image")).toBe(true);
    expect(new Set(alts).size).toBe(25);
  });

  it("creates 25 image cards by cropping a single generated grid image", async () => {
    const imageStore = new GeneratedImageStore();
    const gridSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="503" height="497">
        <rect width="503" height="497" fill="#e0c36b"/>
        ${Array.from({ length: 25 }, (_, index) => {
          const x = 4 + (index % 5) * 99;
          const y = 1 + Math.floor(index / 5) * 99;
          const value = (index + 1).toString(16).padStart(2, "0");
          return `<rect x="${x + 6}" y="${y + 6}" width="87" height="87" fill="#${value}${value}${value}"/>`;
        }).join("")}
      </svg>
    `);

    const deck = await createImageDeckFromGrid("ROOM1", gridSvg, imageStore);
    const imageUrls = deck.contents.map((card) => (card.type === "image" ? card.imageUrl : ""));

    expect(deck.mode).toBe("ai");
    expect(deck.contents).toHaveLength(25);
    expect(new Set(imageUrls).size).toBe(25);
    const firstImage = imageStore.get(imageUrls[0]!);
    expect(firstImage).toMatchObject({
      contentType: "image/png",
    });
    const sharp = (await import("sharp")).default;
    await expect(sharp(firstImage!.data).metadata()).resolves.toMatchObject({
      width: 512,
      height: 512,
    });
  });
});
