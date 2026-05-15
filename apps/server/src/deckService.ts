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
export const codenamesPicturesReferenceImageUrl =
  "https://www.geekyhobbies.com/wp-content/uploads/2019/02/Codenames-Pictures-Setup.jpg";

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
}

const providerDefinitions: Record<AiDeckConfig["provider"], ProviderDefinition> = {
  openai: {},
  volcano: {
    textBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
    imageBaseURL: "https://ark.cn-beijing.volces.com/api/v3",
  },
  tongyi: {
    textBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
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

const fallbackImageCards = [
  { alt: "超人", imageUrl: "/fallback-image-cards/card-01.webp" },
  { alt: "钢铁侠", imageUrl: "/fallback-image-cards/card-02.webp" },
  { alt: "汉堡", imageUrl: "/fallback-image-cards/card-03.webp" },
  { alt: "披萨", imageUrl: "/fallback-image-cards/card-04.webp" },
  { alt: "特洛伊木马攻城", imageUrl: "/fallback-image-cards/card-05.webp" },
  { alt: "扳手蜘蛛", imageUrl: "/fallback-image-cards/card-06.webp" },
  { alt: "花瓶月亮", imageUrl: "/fallback-image-cards/card-07.webp" },
  { alt: "雨伞灯塔", imageUrl: "/fallback-image-cards/card-08.webp" },
  { alt: "钥匙蘑菇", imageUrl: "/fallback-image-cards/card-09.webp" },
  { alt: "指南针火箭", imageUrl: "/fallback-image-cards/card-10.webp" },
  { alt: "钟楼章鱼", imageUrl: "/fallback-image-cards/card-11.webp" },
  { alt: "小船皇冠", imageUrl: "/fallback-image-cards/card-12.webp" },
  { alt: "茶杯海浪", imageUrl: "/fallback-image-cards/card-13.webp" },
  { alt: "手套仙人掌", imageUrl: "/fallback-image-cards/card-14.webp" },
  { alt: "镜子山洞", imageUrl: "/fallback-image-cards/card-15.webp" },
  { alt: "风筝海马", imageUrl: "/fallback-image-cards/card-16.webp" },
  { alt: "小提琴桥", imageUrl: "/fallback-image-cards/card-17.webp" },
  { alt: "南瓜潜艇", imageUrl: "/fallback-image-cards/card-18.webp" },
  { alt: "望远镜花朵", imageUrl: "/fallback-image-cards/card-19.webp" },
  { alt: "蜡烛雪花", imageUrl: "/fallback-image-cards/card-20.webp" },
  { alt: "贝壳阶梯", imageUrl: "/fallback-image-cards/card-21.webp" },
  { alt: "吊坠珊瑚", imageUrl: "/fallback-image-cards/card-22.webp" },
  { alt: "纸鹤行星", imageUrl: "/fallback-image-cards/card-23.webp" },
  { alt: "鼓锚", imageUrl: "/fallback-image-cards/card-24.webp" },
  { alt: "沙漏莲花", imageUrl: "/fallback-image-cards/card-25.webp" },
];

const imageSingleSubjectPool = [
  "a caped flying hero with no logo, no letter, no brand symbol",
  "an armored metal hero suit with a glowing chest shape, no logo, no brand symbol",
  "a stacked hamburger",
  "a slice of pizza",
  "a wooden horse siege machine outside an ancient city gate",
  "a castle tower",
  "a paper airplane",
  "a hot air balloon",
  "a treasure map with no writing",
  "a lighthouse",
  "a rocket",
  "a submarine",
  "a knight helmet",
  "a pirate ship",
  "a crystal cave",
  "a magic lamp with no text",
  "a train tunnel",
  "a space capsule",
  "a clock tower",
  "a theater mask",
  "an internet cafe full of computers with no screen text",
  "an aircraft carrier at sea with no flags or numbers",
  "a rice field with irrigation channels",
  "a woman doctor in a clinic with no text",
  "a taxi on a city street with no logo",
  "a train station platform with no signs or text",
  "a restaurant dining room",
  "an airport runway with a plane and no markings",
  "a classroom with desks and a blank blackboard",
  "a hotel lobby with no text",
  "a supermarket aisle with no signs or labels",
  "a city skyline",
  "a kitchen with stove and sink",
  "a library reading room with no book text",
  "a public park with paths and benches",
  "a bathroom with sink and shower",
  "a museum gallery with statues and no plaques",
  "a sports playground",
  "a factory floor with machines",
  "an apartment building",
  "a gas station with no logo or text",
  "an ambulance with no letters or medical symbols",
  "a delivery truck with no logo",
  "a living room with sofa and lamp",
  "a dormitory room with bunk beds",
  "a prince with a plain crown and no emblem",
  "a martial arts dojo with no banners or text",
  "a balcony with potted plants",
  "a post office counter with no writing",
  "an island harbor",
  "a coastal beach",
  "a quiet lake",
  "a naval ship with no flags or numbers",
  "a warehouse full of crates with no labels",
  "a greenhouse full of plants",
  "a theater stage with curtains",
  "a farmer in a field",
  "a police officer silhouette with no badge text",
  "a nurse at a hospital bed with no symbols",
  "a construction engineer at a blueprint table with no text",
  "a newsstand with blank papers and no writing",
  "a banquet hall with round tables",
  "a dragon boat festival scene with no characters",
  "a radio studio with no text on equipment",
  "a market stall with fruit baskets and no signs",
  "a kindergarten classroom with toys and no letters",
  "a shipyard with cranes and boats",
  "a mountain village",
  "a vineyard on a hillside",
  "a space observatory dome",
  "a bookstore interior with blank book covers",
  "a hotel building with no sign",
  "a farm with fields and a barn",
  "a ranch with fences and grazing silhouettes",
  "a fishing pond with nets and small boats",
  "a gymnasium court with no markings or text",
  "an amusement park with a ferris wheel",
  "an art museum hall with framed blank paintings",
  "an exhibition hall with display cases and no labels",
  "a botanical garden greenhouse",
  "a vegetable garden with neat rows",
  "an orchard full of fruit trees",
  "a tea house with low tables",
  "a coffee shop counter with no menu text",
  "a bakery storefront with no sign",
  "a pharmacy interior with blank shelves and no symbols",
  "a barbershop chair and mirror with no text",
  "a clothing store with mannequins and no logo",
  "a shoe store display with no brand signs",
  "a toy shop window with no lettering",
  "a fire station garage with a fire truck and no text",
  "a passenger train on tracks",
  "a fishing boat on calm water",
  "a cargo truck on a road with no logo",
  "a city bus with no route text",
  "an electric scooter parked by a wall",
  "a fire truck with no letters or numbers",
  "a school bus with blank sides and no text",
  "a tractor in a field",
  "a helicopter landing pad with no markings",
  "a wheelchair in a quiet hallway",
  "a baby stroller in a park",
  "a shopping cart in a supermarket aisle",
  "a study room with shelves and a desk",
  "a garage with tools and a car",
  "a villa with a garden",
  "an office with desks and blank monitors",
  "a bedroom with bed and window",
  "a restroom with stalls and sinks",
  "a garage door opening to a driveway",
  "a high-rise building",
  "a private villa on a hill",
  "a bridge over a river",
  "a highway overpass with no signs",
  "a railway bridge",
  "a river harbor dock",
  "a ship cabin with portholes",
  "an airplane cabin with blank seats",
  "an airplane wing over clouds",
  "a ferry terminal with no signs",
  "a pier with moored boats",
  "a dockside crane yard",
  "a mountain range",
  "a snowy mountain peak",
  "a volcano crater",
  "a desert dune field",
  "a river valley",
  "a canyon cliff",
  "a sea bay",
  "a sandy beach",
  "a cave entrance",
  "a forest trail",
  "a bamboo grove",
  "a wheat field",
  "a corn field",
  "a tea plantation",
  "a fruit market stall with no signs",
  "a hot pot restaurant table",
  "a barbecue grill scene",
  "a noodle shop kitchen with no menu text",
  "a school classroom with blank posters",
  "a school playground",
  "a principal office with no certificates or writing",
  "a hospital ward with no symbols",
  "a police station lobby with no emblems or text",
  "a newspaper office with blank pages",
  "a radio broadcast room with no labels",
  "a television studio set with no screen text",
  "a film set with camera lights",
  "a cartoon screening room with a blank screen",
  "a wedding banquet hall",
  "a family living room scene",
  "a village town street",
  "a small town square",
  "a city street corner with no signs",
  "a capital city plaza with no flags or text",
  "a riverside pavilion",
  "a garden pavilion",
  "a traditional courtyard house",
  "a warehouse loading bay with blank boxes",
  "a machine workshop",
  "a construction site with crane and no signs",
  "a ship on open sea with no flag",
  "a cargo ship at port with no markings",
  "a sailboat under wind",
  "a hot air balloon festival with no text",
  "a rocket launch pad with no numbers",
  "a submarine underwater scene",
  "a clock tower square with no signage",
  "a lighthouse on a cliff",
  "the planet Mars as a red rocky world with no text",
  "an astronaut walking on a rocky planet with no flag or mission patch",
  "a basketball player shooting a ball with no jersey number or logo",
  "a badminton player swinging a racket with no logo or text",
  "a skier going downhill on snow with no race number",
  "a woodcutter chopping a tree with an axe",
  "a musician playing a violin on a small stage with no sheet music text",
  "a musician playing a drum set on a small stage with no logos",
  "a family watching television with a blank screen and no text",
  "a chef cooking in a kitchen with no labels",
  "a painter painting on a blank canvas with no signature",
  "a dancer performing on a stage with no backdrop text",
  "a swimmer diving into a pool with no lane numbers",
  "a cyclist riding on a road with no jersey logo",
  "a runner crossing a finish line with no numbers or banners",
  "a gardener watering plants in a garden",
  "a fisherman casting a net from a small boat",
  "a firefighter spraying water with no badge text",
  "a pilot in a cockpit with no instrument text",
  "a mechanic repairing a car with no brand logo",
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
      contents: fallbackImageCards.map((card) => ({
        type: "image" as const,
        imageUrl: card.imageUrl,
        alt: card.alt,
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
    throw new Error(
      `图片牌库需要可加载的 sharp 原生依赖。源码运行请执行 corepack pnpm install；桌面版请使用包含 Windows sharp 原生包的新版构建。原始错误：${message}`,
    );
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
  if (config.provider !== "openai" && !provider.imageBaseURL) {
    throw new Error("当前服务商不支持图片牌库生成");
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

export function imageGenerationRequestOptions(config: AiDeckConfig, prompt: string) {
  return {
    model: config.imageModel,
    prompt,
    n: 1,
    size: "2048x2048",
    ...(config.provider !== "openai" ? { response_format: "b64_json" } : {}),
    ...(config.provider === "volcano"
      ? {
          image: codenamesPicturesReferenceImageUrl,
          watermark: false,
        }
      : {}),
    ...(config.provider === "volcano" ? { output_format: "png" } : {}),
  };
}

async function fetchImageBuffer(url: string, fetchImpl: FetchLike): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const imageObjectPool = [
  "horse",
  "wrench",
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
  "spider",
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
  "thumb",
  "elevator button",
  "small car",
  "rice bowl",
  "desk",
  "blank newspaper",
  "wristwatch",
  "mobile phone with blank screen",
  "chopsticks",
  "hat",
  "plate",
  "pencil",
  "skirt",
  "suitcase",
  "panda",
  "eyeglasses",
  "camera",
  "notebook with blank cover",
  "cookie",
  "baby bottle",
  "bone",
  "cardboard box",
  "monkey",
  "dumpling",
  "trash can",
  "ping pong paddle",
  "tennis ball",
  "shuttlecock",
  "seat cushion",
  "steamed bun",
  "quilt",
  "fork",
  "toy block with no letters",
  "train carriage",
  "pond",
  "ruler with no numbers",
  "pet collar",
  "rug",
  "radio microphone",
  "pipe",
  "tin can with no label",
  "peanut",
  "gear",
  "keyboard key with no letter",
  "truck tire",
  "wool scarf",
  "heart organ",
  "wallet",
  "crutch",
  "earring",
  "coin stack",
  "plastic bag",
  "sock",
  "comb teeth",
  "wood log",
  "potato",
  "carrot",
  "cabbage",
  "rice grain",
  "noodle bowl",
  "cake slice",
  "bread loaf",
  "juice glass",
  "milk carton with no label",
  "ice cube",
  "refrigerator",
  "washing machine",
  "sofa",
  "curtain",
  "blank name card",
  "blank postcard",
  "ticket stub with no text",
  "ticket window",
  "fuel pump with no numbers",
  "toolbox",
  "screw",
  "bolt",
  "nut",
  "paint brush",
  "dustpan",
  "broom",
  "flowerpot",
  "potted plant",
  "sprout",
  "tree stump",
  "bamboo leaf",
  "rice stalk",
  "corn cob",
  "tomato",
  "eggplant",
  "onion",
  "garlic bulb",
  "watermelon slice",
  "orange wedge",
  "banana peel",
  "grape bunch",
  "strawberry",
  "peach",
  "walnut shell",
  "oyster shell",
  "fishbone",
  "shrimp",
  "basketball",
  "volleyball",
  "soccer ball",
  "baseball cap",
  "roller skate",
  "boxing glove",
  "whistle cord",
  "life ring",
  "safety cone",
  "traffic light with no symbols",
  "street bench",
  "bus stop pole with no sign",
  "doorknob",
  "window curtain",
  "floor tile",
  "ceiling fan",
  "desk lamp",
];

function randomSeed(random: () => number) {
  return Array.from({ length: 8 }, () => Math.floor(Math.min(Math.max(random(), 0), 0.9999999999999999) * 36).toString(36)).join("");
}

function createImageObjectSets(random: () => number) {
  const singleSubjects = sampleWords(imageSingleSubjectPool, 5, random).map((subject) => `single subject: ${subject}`);
  const objects = sampleWords(imageObjectPool, 60, random);
  const fusionSubjects = Array.from({ length: 20 }, (_, index) => `fusion subjects: ${objects.slice(index * 3, index * 3 + 3).join(" + ")}`);
  return shuffleItems([...singleSubjects, ...fusionSubjects], random);
}

export function imageGridPrompt(random: () => number = Math.random) {
  const seed = randomSeed(random);
  const objectSets = createImageObjectSets(random);
  return [
    `Random seed: ${seed}.`,
    "Goal: Create one square production sprite sheet for a Codenames picture board; after cropping, the 25 cells become the playable picture cards for one round.",
    "Layout: Use exactly 25 equal invisible cells in a 5 by 5 grid, edge to edge. Hard crop guides sit at x and y = 0%, 20%, 40%, 60%, 80%, 100%. Keep every composition fully inside its own 20% by 20% cell. No outer padding, centered board, poster border, frame, page margin, visible grid, cell border, rounded card frame, shadow, gutter, divider, perspective, tilted sheet, collage layout, or cross-cell spill.",
    "Cell briefs: Every invisible cell gets one private brief, in this shuffled order: " + objectSets.join("; ") + ".",
    "Composition: Exactly 5 cells use their single-subject brief as one clear main subject. Exactly 20 cells use their fusion-subject brief: choose the two most visually compatible objects from the three-object set, ignore the third, and show both chosen objects clearly. For fusion cells, combine the two subjects through interaction, contour, transformation, or a small shared scene; for single-subject cells, keep the subject iconic and easy to recognize. Add no extra unlisted objects, avoid branded costume details, keep all 25 cells visually different, and leave at least 16 percent blank breathing room around the composition.",
    "Reference: Reference Codenames: Pictures for readable surreal clue logic and compact card-image feel.",
    "Style: Warm yellow kraft paper background only; subjects in black, white, and gray ink only. Use simple readable silhouettes, thin dark outlines, clear negative space, and subtle paper grain. No colored subjects or tinted fills.",
    "Hard constraints: Do not draw any text, letters, numbers, captions, labels, logos, watermarks, flags, maps, UI icons, or brand-like symbols. Output a single flat front-facing square image suitable for deterministic equal cropping into 25 independent cards.",
  ].join(" ");
}
