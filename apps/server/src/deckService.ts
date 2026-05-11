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
  const cellInset = Math.max(0, Math.floor(cellSize * 0.14));
  const cropSize = cellSize - cellInset * 2;
  if (cropSize < 32) {
    throw new Error("Generated image grid cells are too small after safe cropping");
  }
  for (let index = 0; index < 25; index += 1) {
    const cardId = `card-${index + 1}`;
    const left = sourceLeft + (index % 5) * cellSize + cellInset;
    const top = sourceTop + Math.floor(index / 5) * cellSize + cellInset;
    const data = await sharp(gridImage)
      .extract({ left, top, width: cropSize, height: cropSize })
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

const imageSubjectPool = [
  "glass orchid under rain",
  "porcelain whale in a teacup",
  "copper umbrella over a pearl",
  "moonlit shell with tiny stairs",
  "crystal fox beside a lantern",
  "silver cactus in a velvet pot",
  "paperless kite tied to a stone",
  "jellyfish inside a snow globe",
  "wooden crown on a mushroom",
  "bronze fish with butterfly fins",
  "tiny lighthouse made of ice",
  "velvet comet above a bowl",
  "clockless tower shaped like a pear",
  "blue flame inside a seashell",
  "marble rabbit holding a feather",
  "golden apple with glass wings",
  "submarine shaped like a walnut",
  "violin flower without strings",
  "folded mountain inside a bottle",
  "lantern tree with round fruit",
  "ceramic bird under an arch",
  "pearl helmet on soft moss",
  "small bridge made of coral",
  "sailing shoe on calm water",
  "magnolia moon over a cup",
  "glass snail carrying a lantern",
  "jade umbrella beside a cloud",
  "paperless fan made of leaves",
  "amber crab with crystal claws",
  "quiet volcano in a bowl",
  "silver bee beside a compass rose",
  "woolen star inside a nest",
  "small castle made of shells",
  "floating spoon under a planet",
  "lacquered turtle with a sail",
  "plum blossom shaped like a key",
  "frozen teapot on a hill",
  "velvet mask beside a mirror",
  "pebble dragonfly over water",
  "green bottle with a tiny forest",
  "copper moon behind bamboo",
  "ivory chess knight in grass",
  "rain cloud held by a hook",
  "glass acorn under a lamp",
  "tiny boat made of leaves",
  "spiral shell with a doorway",
  "white tiger carved from smoke",
  "ruby seed inside a nest",
  "quiet rocket made of clay",
  "crystal deer near a fountain",
  "lantern pear on a branch",
  "silver cup with a waterfall",
  "mossy helmet beside a flower",
  "porcelain owl above a pond",
  "golden feather in a cup",
  "stone violin under a leaf",
  "cloud-shaped chair in grass",
  "glass pumpkin on a hill",
  "bronze swan beside reeds",
  "tiny observatory made of ice",
  "velvet shell holding a star",
  "jade fish above a ribbon",
  "copper pear with small wings",
  "marble kite over a pond",
  "quiet bell made of snow",
  "crystal tent under a moon",
  "amber horse beside a fern",
  "small island in a bowl",
  "silver mushroom under rain",
  "porcelain boat inside a shell",
  "glass rose beside a pebble",
  "paperless crane made of clouds",
  "bronze leaf with a doorway",
  "tiny harp made of bamboo",
  "velvet planet in a nest",
  "jade lantern over still water",
  "ceramic moon inside a cave",
  "silver ladder beside a flower",
  "crystal apple under snow",
  "copper bird with leaf wings",
];

function randomSeed(random: () => number) {
  return Array.from({ length: 8 }, () => Math.floor(Math.min(Math.max(random(), 0), 0.9999999999999999) * 36).toString(36)).join("");
}

export function imageGridPrompt(random: () => number = Math.random) {
  const seed = randomSeed(random);
  const subjects = sampleWords(imageSubjectPool, 25, random);
  return [
    `Random seed: ${seed}.`,
    "Create one square image for a Codenames-style picture board with an invisible 5 by 5 layout.",
    "The image must contain exactly 25 equal invisible cells, arranged in five rows and five columns, filling the full square canvas edge to edge.",
    "Keep the grid mathematically regular: every cell has the same size, no perspective, no tilted contact sheet, no outer margin, no offset rows, and no subject crossing into neighboring cells.",
    "There must be no visible grid lines, cell borders, rounded card frames, drop shadows, margins, gutters, dividers, or seams.",
    "Every invisible cell must contain exactly one centered visual subject from this private art-direction list, in this shuffled order: " + subjects.join("; ") + ".",
    "The subject words are instructions only. Never draw the words themselves, never draw captions, and never draw labels.",
    "Make all 25 subjects visually different from each other, keep each subject fully inside the central safe area of its own invisible cell, and leave at least 12 percent blank breathing room around it.",
    "Avoid objects that usually contain writing: no signs, paper sheets, labels, packages, screens, books, maps, tickets, stamps, badges, seals, posters, documents, clocks, watches, or keyboards.",
    "Leave clean aged yellow kraft paper texture background around each subject inside its invisible cell so deterministic cropping has comfortable breathing room.",
    "Style: black and white line drawing, ink sketch, no color except the aged yellow kraft paper texture background across the full image.",
    "Use simple readable silhouettes, clear negative space, thin dark outlines, and light paper grain.",
    "Do not draw any text: no Chinese characters, Latin letters, numbers, glyph-like marks, captions, labels, annotations, title cards, readable text, logos, watermarks, maps, flags, UI icons, or brand-like symbols.",
    "The output must be a single flat front-facing square image, suitable for deterministic 5 by 5 equal cropping into independent cards.",
  ].join(" ");
}
