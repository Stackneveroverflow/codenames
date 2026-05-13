import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { z } from "zod";

import type { AiDeckConfig, GameMode, ValidatedDeck } from "@codenames/shared";

import { fallbackWords } from "./fallbackWords.js";
import type { GeneratedImageStore } from "./generatedImageStore.js";

const deckSchema = z.object({
  cards: z.array(z.string().min(2).max(6)).length(25),
});

const bannedWords = ["毒品", "炸弹", "自杀", "政治", "总统", "品牌", "明星"];
const chineseWordPattern = /^[\p{Script=Han}]{2,6}$/u;

type FetchLike = typeof fetch;

type TextClient = Pick<OpenAI, "chat">;

interface GenerateAiDeckOptions {
  mode?: GameMode;
  aiConfig?: AiDeckConfig | null;
  textClient?: TextClient;
  imageStore?: GeneratedImageStore;
  roomId?: string;
  fetchImpl?: FetchLike;
  random?: () => number;
}

interface ProviderDefinition {
  textBaseURL?: string;
  imageBaseURL?: string;
  imageKind: "openai" | "dashscope" | "hunyuan";
}

const providerDefinitions: Record<AiDeckConfig["provider"], ProviderDefinition> = {
  openai: {
    imageKind: "openai",
  },
  volcano: {
    textBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    imageBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    imageKind: "openai",
  },
  tongyi: {
    textBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    imageKind: "dashscope",
  },
  hunyuan: {
    textBaseURL: "https://api.hunyuan.cloud.tencent.com/v1",
    imageKind: "hunyuan",
  },
};

export function validateWords(words: string[]): string[] {
  if (words.length !== 25) {
    throw new Error("Deck must contain exactly 25 words");
  }

  const normalized = words.map((word) => word.trim());
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error("Deck contains duplicate words");
  }

  for (const word of normalized) {
    if (!chineseWordPattern.test(word)) {
      throw new Error(`Invalid word: ${word}`);
    }
    if (bannedWords.some((entry) => word.includes(entry))) {
      throw new Error(`Sensitive word: ${word}`);
    }
  }

  return normalized;
}

const imageCardAlts = [
  "旧相机",
  "档案袋",
  "指南针",
  "打字机",
  "胶片",
  "放大镜",
  "怀表",
  "密信",
  "电话",
  "油灯",
  "地图",
  "印章",
  "车票",
  "钥匙",
  "雨伞",
  "咖啡杯",
  "剧院",
  "港口",
  "钟楼",
  "手套",
  "望远镜",
  "火柴盒",
  "留声机",
  "羽毛笔",
  "邮票",
];

function sampleWords(words: readonly string[], count: number, random: () => number): string[] {
  const pool = words.slice();
  for (let index = 0; index < count; index += 1) {
    const remaining = pool.length - index;
    const raw = Math.min(Math.max(random(), 0), 0.9999999999999999);
    const selected = index + Math.floor(raw * remaining);
    [pool[index], pool[selected]] = [pool[selected]!, pool[index]!];
  }
  return pool.slice(0, count);
}

function shuffleItems<T>(items: readonly T[], random: () => number): T[] {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const raw = Math.min(Math.max(random(), 0), 0.9999999999999999);
    const selected = Math.floor(raw * (index + 1));
    [next[index], next[selected]] = [next[selected]!, next[index]!];
  }
  return next;
}

export function createFallbackDeck(mode: GameMode = "text", random: () => number = Math.random): ValidatedDeck {
  if (mode === "image") {
    return {
      mode: "fallback",
      contents: imageCardAlts.map((alt, index) => ({
        type: "image" as const,
        imageUrl: index % 2 === 0 ? "/mode-image.jpg" : "/deck-cover.jpg",
        alt,
      })),
    };
  }

  const contents = sampleWords(fallbackWords, 25, random).map((text) => ({ type: "word" as const, text }));
  return {
    mode: "fallback",
    contents,
  };
}

export async function createImageDeckFromGrid(roomId: string, gridImage: Buffer, imageStore: GeneratedImageStore, random: () => number = Math.random): Promise<ValidatedDeck> {
  const sharp = await loadSharp();
  const metadata = await sharp(gridImage).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Generated image grid has no dimensions");
  }

  const squareSize = Math.min(metadata.width, metadata.height);
  const gridSize = squareSize - (squareSize % 5);
  const cellSize = gridSize / 5;
  if (cellSize < 32) {
    throw new Error("Generated image grid is too small");
  }
  const sourceLeft = Math.floor((metadata.width - gridSize) / 2);
  const sourceTop = Math.floor((metadata.height - gridSize) / 2);

  const dealId = randomUUID();
  const contents = [];
  for (let index = 0; index < 25; index += 1) {
    const cardId = `card-${index + 1}`;
    const left = sourceLeft + (index % 5) * cellSize;
    const top = sourceTop + Math.floor(index / 5) * cellSize;
    const data = await sharp(gridImage)
      .extract({ left, top, width: cellSize, height: cellSize })
      .resize(512, 512, { fit: "cover" })
      .png()
      .toBuffer();
    const imageUrl = imageStore.urlFor(roomId, dealId, cardId);
    imageStore.put(imageUrl, { contentType: "image/png", data });
    contents.push({ type: "image" as const, imageUrl, alt: "" });
  }

  return {
    mode: "ai",
    contents: shuffleItems(contents, random),
  };
}

async function loadSharp() {
  try {
    const module = await import("sharp");
    return module.default;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`图片牌库需要安装 sharp 依赖，请先运行 corepack pnpm install。原始错误：${message}`);
  }
}

export async function generateAiDeck(options: GenerateAiDeckOptions = {}): Promise<ValidatedDeck> {
  const mode = options.mode ?? "text";
  if (!options.aiConfig) {
    return createFallbackDeck(mode);
  }

  if (mode === "image") {
    if (!options.imageStore || !options.roomId) {
      throw new Error("Image deck generation requires an image store and room id");
    }
    const random = options.random ?? Math.random;
    const gridImage = await generateImageGrid(options.aiConfig, options.fetchImpl ?? fetch, random);
    const deck = await createImageDeckFromGrid(options.roomId, gridImage, options.imageStore, random);
    return { ...deck, model: options.aiConfig.imageModel };
  }

  const validated = await generateTextWords(options.aiConfig, options.textClient);
  return {
    mode: "ai",
    model: options.aiConfig.textModel,
    contents: validated.map((text) => ({ type: "word" as const, text })),
  };
}

function createTextClient(config: AiDeckConfig): TextClient {
  const provider = providerDefinitions[config.provider];
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: provider.textBaseURL,
    timeout: 60_000,
    maxRetries: 1,
  });
}

async function generateTextWords(config: AiDeckConfig, client = createTextClient(config)): Promise<string[]> {
  const response = await client.chat.completions.create({
    model: config.textModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你负责生成中文 Codenames 词牌。只返回 JSON，格式为 {\"cards\":[...]}。cards 必须恰好 25 个元素，每个元素是2到6个中文字符的常见名词或短语，去重，无敏感词，无品牌人名地名，不要标点数字。",
      },
      {
        role: "user",
        content: "返回 25 个适合大众联想的中文词条。",
      },
    ],
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("AI text generation returned empty content");
  }
  const parsed = deckSchema.parse(JSON.parse(raw));
  return validateWords(parsed.cards);
}

async function generateImageGrid(config: AiDeckConfig, fetchImpl: FetchLike, random: () => number): Promise<Buffer> {
  const prompt = imageGridPrompt(random);
  const provider = providerDefinitions[config.provider];

  if (provider.imageKind === "dashscope") {
    return generateDashScopeImageGrid(config, prompt, fetchImpl);
  }

  if (provider.imageKind === "hunyuan") {
    return generateHunyuanImageGrid(config, prompt, fetchImpl);
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: provider.imageBaseURL,
    timeout: 120_000,
    maxRetries: 1,
  });
  const response = (await client.images.generate(imageGenerationRequestOptions(config, prompt) as never)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const image = response.data?.[0];
  if (image?.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }
  if (image?.url) {
    return fetchImageBuffer(image.url, fetchImpl);
  }
  throw new Error("AI image generation returned no image");
}

const volcanoOutputFormatImageModels = new Set(["doubao-seedream-5-0-260128"]);

export function imageGenerationRequestOptions(config: AiDeckConfig, prompt: string) {
  return {
    model: config.imageModel,
    prompt,
    n: 1,
    size: "2048x2048",
    response_format: "b64_json",
    ...(config.provider === "volcano" ? { watermark: false } : {}),
    ...(config.provider === "volcano" && volcanoOutputFormatImageModels.has(config.imageModel)
      ? { output_format: "png" }
      : {}),
  };
}

async function generateDashScopeImageGrid(config: AiDeckConfig, prompt: string, fetchImpl: FetchLike): Promise<Buffer> {
  const response = await fetchImpl("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: config.imageModel,
      input: { prompt },
      parameters: { size: "2048*2048", n: 1 },
    }),
  });
  const submitted = await readJson(response);
  const taskId = submitted.output?.task_id;
  if (!taskId) {
    throw new Error("通义图片生成未返回任务 ID");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(1500);
    const poll = await fetchImpl(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    const payload = await readJson(poll);
    const status = payload.output?.task_status;
    if (status === "SUCCEEDED") {
      const url = payload.output?.results?.[0]?.url;
      if (!url) {
        throw new Error("通义图片生成成功但未返回图片 URL");
      }
      return fetchImageBuffer(url, fetchImpl);
    }
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`通义图片生成失败：${payload.message ?? status}`);
    }
  }

  throw new Error("通义图片生成超时");
}

async function generateHunyuanImageGrid(config: AiDeckConfig, prompt: string, fetchImpl: FetchLike): Promise<Buffer> {
  const response = await fetchImpl("https://api.hunyuan.cloud.tencent.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.imageModel,
      prompt,
      n: 1,
      size: "2048x2048",
      response_format: "b64_json",
    }),
  });
  const payload = await readJson(response);
  const image = payload.data?.[0];
  if (image?.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }
  if (image?.url) {
    return fetchImageBuffer(image.url, fetchImpl);
  }
  throw new Error("混元图片生成未返回图片");
}

async function fetchImageBuffer(url: string, fetchImpl: FetchLike): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readJson(response: Response): Promise<any> {
  if (!response.ok) {
    throw new Error(`AI provider request failed: ${response.status}`);
  }
  return response.json();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const imageObjectPool = [
  "horse",
  "snail",
  "lantern",
  "sailboat",
  "jellyfish",
  "lifeboat",
  "pebbles",
  "archway",
  "bird",
  "standing stone",
  "fox",
  "fan",
  "owl",
  "walnut",
  "parasol",
  "pumpkin",
  "mountain",
  "fountain",
  "violin",
  "bottle",
  "teacup",
  "chess king",
  "chair",
  "rabbit",
  "steamboat",
  "deer",
  "key",
  "pear",
  "dragonfly",
  "shell",
  "mushroom",
  "fish",
  "flower",
  "goose",
  "bowl",
  "kite",
  "streetlamp",
  "volcano",
  "dove",
  "turtle",
  "lighthouse",
  "apple",
  "ladder",
  "moon",
  "tree",
  "tiger",
  "cloud",
  "cave door",
  "cactus",
  "crown",
  "submarine",
  "rocket",
  "bridge",
  "shoe",
  "bee",
  "nest",
  "spoon",
  "teapot",
  "mask",
  "acorn",
  "crab",
  "star",
  "tent",
  "bell",
  "crane",
  "leaf",
  "harp",
  "planet",
  "helmet",
  "feather",
  "rose",
  "island",
  "observatory",
  "comet",
  "tower",
  "waterfall",
  "coral",
  "ribbon",
  "pearl",
  "compass",
  "anchor",
  "mirror",
  "magnolia",
  "umbrella",
  "doorway",
  "glove",
  "hourglass",
  "needle",
  "paper crane",
  "candle",
  "drum",
  "flute",
  "helmet visor",
  "chain",
  "wheel",
  "net",
  "seed",
  "crystal",
  "pillow",
  "vase",
  "basket",
  "cocoon",
  "fossil",
  "raindrop",
  "snowflake",
  "island cliff",
  "maze gate",
  "gourd",
  "sundial",
  "whistle",
  "oar",
  "shell staircase",
  "balloon",
  "pendant",
  "magnifying glass",
  "orchid",
  "beehive",
  "swan",
  "reed",
  "seahorse",
  "octopus",
  "clam",
  "starfish",
  "seaweed",
  "coral arch",
  "driftwood",
  "lily pad",
  "lotus",
  "pinecone",
  "fern",
  "bamboo stalk",
  "willow branch",
  "maple leaf",
  "thorn branch",
  "ivy vine",
  "wheat bundle",
  "moss stone",
  "river stone",
  "geode",
  "crystal shard",
  "obsidian",
  "marble column",
  "clay jar",
  "porcelain spoon",
  "tea kettle",
  "goblet",
  "chalice",
  "silver tray",
  "wooden bowl",
  "woven basket",
  "thread spool",
  "thimble",
  "scissors",
  "comb",
  "hairpin",
  "brooch",
  "ring",
  "bracelet",
  "locket",
  "monocle",
  "spyglass",
  "lantern hook",
  "oil lamp",
  "firefly",
  "butterfly",
  "moth",
  "beetle",
  "grasshopper",
  "frog",
  "lizard",
  "hedgehog",
  "squirrel",
  "badger",
  "otter",
  "raven",
  "heron",
  "flamingo",
  "penguin",
  "whale",
  "dolphin",
  "seal",
  "camel",
  "elephant",
  "giraffe",
  "zebra",
  "lion",
  "bear",
  "wolf",
  "goat",
  "ram horn",
  "antler",
  "hoofprint",
  "pawprint",
  "feather fan",
  "wing",
  "egg",
  "cobweb",
  "cave crystal",
  "mountain peak",
  "water lily",
];

function randomSeed(random: () => number) {
  return Array.from({ length: 8 }, () => Math.floor(Math.min(Math.max(random(), 0), 0.9999999999999999) * 36).toString(36)).join("");
}

function createImageObjectSets(random: () => number) {
  const objects = sampleWords(imageObjectPool, 75, random);
  return Array.from({ length: 25 }, (_, index) => objects.slice(index * 3, index * 3 + 3).join(" + "));
}

export function imageGridPrompt(random: () => number = Math.random) {
  const seed = randomSeed(random);
  const objectSets = createImageObjectSets(random);
  return [
    `Random seed: ${seed}.`,
    "Create one square production sprite sheet for a Codenames-style picture board with an invisible 5 by 5 crop layout.",
    "Layout is mandatory and more important than illustration style: exactly 25 equal invisible cells, five rows and five columns, filling the full square canvas edge to edge.",
    "Imagine hard crop guides at x = 0%, 20%, 40%, 60%, 80%, 100% and y = 0%, 20%, 40%, 60%, 80%, 100%; every composition must stay inside its own 20% by 20% crop area.",
    "The top-left cell starts exactly at the image's top-left edge and the bottom-right cell ends exactly at the image's bottom-right edge: no outer padding, no centered board, no poster border, no frame, no page margin.",
    "Keep the grid mathematically regular: every cell has the same size, no perspective, no tilted contact sheet, no offset rows, no collage layout, and no subject crossing into neighboring cells.",
    "There must be no visible grid lines, cell borders, rounded card frames, drop shadows, margins, gutters, dividers, seams, or card-wall styling.",
    "Every invisible cell gets one private three-object candidate set, in this shuffled order: " + objectSets.join("; ") + ".",
    "For each cell, choose exactly the two most visually compatible objects from that cell's three-object candidate set, ignore the third object, and invent one centered abstract riddle-like composition from the chosen pair.",
    "The object words are instructions only. Never draw the words themselves, never draw captions, and never draw labels.",
    "Both chosen objects must be clearly visible and recognizable in the final cell; neither object may disappear, be merely implied, be hidden as texture, or be fused into one unrecognizable single object.",
    "Fuse the chosen two objects through interaction, shared contour, transformation, or a small shared scene, not by simply placing them side by side or stacking them together.",
    "Never draw a cell with only one recognizable object.",
    "Do not add extra unlisted objects, and do not repeat the same composition in another cell.",
    "Make all 25 compositions visually different from each other, keep each complete composition fully inside its own invisible cell, and leave at least 16 percent blank breathing room around the complete composition.",
    "Avoid objects that usually contain writing: no signs, paper sheets, labels, packages, screens, books, maps, tickets, stamps, badges, seals, posters, documents, clocks, watches, or keyboards.",
    "Leave a warm yellow kraft paper envelope-style background around each subject inside its invisible cell so deterministic cropping keeps the whole subject visible.",
    "Style: monochrome black, white, and gray ink drawing on yellow kraft paper only.",
    "Only the paper background may be warm yellow kraft paper. Subjects must be black, white, and gray only.",
    "No colored subjects: no blue, green, red, gold, brown, sepia, watercolor accents, colored highlights, colored shadows, or tinted object fills.",
    "Use simple readable silhouettes, clear negative space, thin dark outlines, and subtle yellow kraft paper grain.",
    "Do not draw any text: no Chinese characters, Latin letters, numbers, glyph-like marks, captions, labels, annotations, title cards, readable text, logos, watermarks, maps, flags, UI icons, or brand-like symbols.",
    "The output must be a single flat front-facing square image, suitable for deterministic 5 by 5 equal cropping into independent cards.",
  ].join(" ");
}
