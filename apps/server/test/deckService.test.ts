import { describe, expect, it, vi } from "vitest";

import { createFallbackDeck, createImageDeckFromGrid, generateAiDeck, validateWords } from "../src/deckService";
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
    expect(deck.contents[0]?.text).toBeTruthy();
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
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
        <rect width="500" height="500" fill="#e0c36b"/>
        ${Array.from({ length: 25 }, (_, index) => {
          const x = (index % 5) * 100;
          const y = Math.floor(index / 5) * 100;
          const value = (index + 1).toString(16).padStart(2, "0");
          return `<rect x="${x + 5}" y="${y + 5}" width="90" height="90" fill="#${value}${value}${value}"/>`;
        }).join("")}
      </svg>
    `);

    const deck = await createImageDeckFromGrid("ROOM1", gridSvg, imageStore);
    const imageUrls = deck.contents.map((card) => (card.type === "image" ? card.imageUrl : ""));

    expect(deck.mode).toBe("ai");
    expect(deck.contents).toHaveLength(25);
    expect(new Set(imageUrls).size).toBe(25);
    expect(imageStore.get(imageUrls[0]!)).toMatchObject({
      contentType: "image/png",
    });
  });
});
