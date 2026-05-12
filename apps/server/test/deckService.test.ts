import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  createFallbackDeck,
  createImageDeckFromGrid,
  generateAiDeck,
  imageGenerationRequestOptions,
  imageGridPrompt,
  validateWords,
} from "../src/deckService";
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

  it("keeps a broad 200-item image object pool for varied generated combinations", () => {
    const source = readFileSync("src/deckService.ts", "utf8");
    const poolSource = source.match(/const imageObjectPool = \[([\s\S]*?)\];/)?.[1] ?? "";
    const objects = [...poolSource.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    expect(objects).toHaveLength(200);
    expect(new Set(objects).size).toBe(200);
  });

  it("asks image models for an invisible 5 by 5 layout without visible card frames", () => {
    const prompt = imageGridPrompt(() => 0);

    expect(prompt).toContain("invisible 5 by 5 crop layout");
    expect(prompt).toContain("production sprite sheet");
    expect(prompt).toContain("hard crop guides");
    expect(prompt).toContain("20% by 20% crop area");
    expect(prompt).toContain("no outer padding");
    expect(prompt).toContain("no centered board");
    expect(prompt).toContain("no visible grid lines");
    expect(prompt).toContain("cell borders");
    expect(prompt).toContain("rounded card frames");
    expect(prompt).toContain("drop shadows");
    expect(prompt).toContain("margins");
    expect(prompt).toContain("gutters");
    expect(prompt).toContain("private three-object candidate set");
    expect(prompt).toContain("choose exactly the two most visually compatible objects");
    expect(prompt).toContain("ignore the third object");
    expect(prompt).toContain("Both chosen objects must be clearly visible");
    expect(prompt).toContain("Never draw a cell with only one recognizable object");
    expect(prompt).toContain("Fuse the chosen two objects");
    expect(prompt).toContain("not by simply placing them side by side or stacking them together");
    expect(prompt).toContain("abstract riddle-like composition");
    expect(prompt).toContain("yellow kraft paper");
    expect(prompt).toContain("Only the paper background");
    expect(prompt).toContain("No colored subjects");
    expect(prompt).toContain("Do not draw any text");
    expect(prompt).toContain("captions");
    expect(prompt).toContain("labels");
    expect(prompt).not.toContain("treasure chest");
    expect(prompt).not.toContain("long tongue");
    expect(prompt).not.toContain("train passing");
  });

  it("randomizes image prompts so generated boards do not repeat the same subjects", () => {
    const firstPrompt = imageGridPrompt(() => 0);
    const secondPrompt = imageGridPrompt(() => 0.999999);

    expect(firstPrompt).not.toBe(secondPrompt);
    expect(firstPrompt).toContain("Random seed");
    expect(secondPrompt).toContain("Random seed");
  });

  it("omits output_format for Volcano Seedream 4.5 image requests", () => {
    const request = imageGenerationRequestOptions(
      {
        provider: "volcano",
        apiKey: "sk-test",
        textModel: "doubao-seed-1-6-250615",
        imageModel: "doubao-seedream-4-5-251128",
      },
      "prompt",
    );

    expect(request).toMatchObject({
      model: "doubao-seedream-4-5-251128",
      prompt: "prompt",
      n: 1,
      size: "2048x2048",
      response_format: "b64_json",
      watermark: false,
    });
    expect(request).not.toHaveProperty("output_format");
  });

  it("keeps output_format for Volcano Seedream 5 image requests", () => {
    const request = imageGenerationRequestOptions(
      {
        provider: "volcano",
        apiKey: "sk-test",
        textModel: "doubao-seed-1-6-250615",
        imageModel: "doubao-seedream-5-0-260128",
      },
      "prompt",
    );

    expect(request).toMatchObject({
      model: "doubao-seedream-5-0-260128",
      output_format: "png",
      watermark: false,
    });
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

  it("keeps each generated grid cell complete without changing model colors", async () => {
    const imageStore = new GeneratedImageStore();
    const gridSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
        <rect width="500" height="500" fill="#e0c36b"/>
        ${Array.from({ length: 25 }, (_, index) => {
          const x = (index % 5) * 100;
          const y = Math.floor(index / 5) * 100;
          return `<rect x="${x + 14}" y="${y + 14}" width="72" height="72" fill="#2060f0"/>`;
        }).join("")}
      </svg>
    `);

    const deck = await createImageDeckFromGrid("ROOM1", gridSvg, imageStore);
    const firstCard = deck.contents.find((card) => card.type === "image" && card.imageUrl.includes("card-1.png"));
    const firstUrl = firstCard?.type === "image" ? firstCard.imageUrl : "";
    const firstImage = imageStore.get(firstUrl)!;
    const sharp = (await import("sharp")).default;
    const pixels = await sharp(firstImage.data).raw().toBuffer({ resolveWithObject: true });
    const channels = pixels.info.channels;
    const centerOffset = ((256 * pixels.info.width + 256) * channels);
    const center = [...pixels.data.slice(centerOffset, centerOffset + 3)];
    const topLeft = [...pixels.data.slice(0, 3)];

    expect(topLeft[0]).toBeGreaterThan(topLeft[2]!);
    expect(topLeft[1]).toBeGreaterThan(topLeft[2]!);
    expect(center[2]).toBeGreaterThan(center[0]!);
    expect(center[2]).toBeGreaterThan(center[1]!);
  });

  it("randomizes cropped image card order after extracting the 5 by 5 grid", async () => {
    const imageStore = new GeneratedImageStore();
    const gridSvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
        <rect width="500" height="500" fill="#e0c36b"/>
      </svg>
    `);

    const deck = await createImageDeckFromGrid("ROOM1", gridSvg, imageStore, () => 0);
    const imageUrls = deck.contents.map((card) => (card.type === "image" ? card.imageUrl : ""));

    expect(imageUrls).toHaveLength(25);
    expect(imageUrls[0]).not.toContain("card-1.png");
    expect(new Set(imageUrls).size).toBe(25);
  });
});
