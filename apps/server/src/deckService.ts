import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { ValidatedDeck } from "@codenames/shared";

import { fallbackWords } from "./fallbackWords";

const deckSchema = z.object({
  cards: z.array(z.string().min(2).max(6)).length(25),
});

const bannedWords = ["毒品", "炸弹", "自杀", "政治", "总统", "品牌", "明星"];
const chineseWordPattern = /^[\p{Script=Han}]{2,6}$/u;

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

export function createFallbackDeck(): ValidatedDeck {
  const contents = fallbackWords.slice(0, 25).map((text) => ({ type: "word" as const, text }));
  return {
    mode: "fallback",
    contents,
  };
}

export async function generateAiDeck(client?: OpenAI): Promise<ValidatedDeck> {
  if (!client) {
    return createFallbackDeck();
  }

  const input = [
    {
      role: "system" as const,
      content:
        "你负责生成中文 Codenames 词牌。只生成常见名词或短语，2到6个中文字符，去重，无敏感词，无品牌人名地名，不要标点数字。",
    },
    {
      role: "user" as const,
      content: "返回 25 个适合大众联想的中文词条。",
    },
  ];

  const model = process.env.OPENAI_DECK_MODEL ?? "gpt-5.4-mini";

  for (const attempt of [1, 2]) {
    try {
      const response = await client.responses.parse({
        model,
        input,
        reasoning: { effort: "low" },
        text: {
          format: zodTextFormat(deckSchema, "codenames_deck"),
        },
      });

      const parsed = response.output
        .flatMap((message) => (message.type === "message" ? message.content : []))
        .find((item) => item.type === "output_text" && "parsed" in item)?.parsed as z.infer<typeof deckSchema> | undefined;

      const validated = validateWords(parsed?.cards ?? []);
      return {
        mode: "ai",
        model,
        contents: validated.map((text) => ({ type: "word" as const, text })),
      };
    } catch (error) {
      if (attempt === 2) {
        return createFallbackDeck();
      }
    }
  }

  return createFallbackDeck();
}

