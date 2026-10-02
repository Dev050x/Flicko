export interface Caption {
  top: string;
  bottom: string;
}

export interface CaptionResult {
  safe: boolean;
  reason: string;
  captions: Caption[];
}

export interface CaptionAi {
  analyse(jpeg: Uint8Array): Promise<CaptionResult>;
  moderateText(text: string): Promise<boolean>;
}

export class CaptionAiError extends Error {}

export interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

const MAX_WORDS = 6;
const MAX_CHARS = 60;

export const SYSTEM_PROMPT = `You review photos for Flicko, an app that turns photos into meme coins.

Safety: set safe=false for nudity or sexual content, anyone who looks like a minor in a sexual or harmful context, graphic violence or gore, hate symbols, self-harm, or visible personal documents (IDs, bank cards, addresses). Ordinary photos of people, pets, food, objects and places are safe. When unsafe, give a short reason and return three empty captions.

Captions: write 3 different classic top/bottom meme captions about what is actually in the photo. At most 6 words per line. Crypto-native humour (gm, ser, wagmi, ngmi, diamond hands, rug, moon, wen, degen) used naturally, not in every line. No slurs, no real people's names, no hashtags, no emojis. One line may be empty but not both.`;

const RESPONSE_SCHEMA = {
  name: "meme_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["safe", "reason", "captions"],
    properties: {
      safe: { type: "boolean" },
      reason: { type: "string" },
      captions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["top", "bottom"],
          properties: { top: { type: "string" }, bottom: { type: "string" } },
        },
      },
    },
  },
};

export const cleanLine = (line: string) =>
  line
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .split(" ")
    .slice(0, MAX_WORDS)
    .join(" ")
    .slice(0, MAX_CHARS)
    .trim();

const parseResult = (content: unknown): CaptionResult => {
  if (typeof content !== "string") throw new CaptionAiError("empty reply");
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new CaptionAiError("reply is not json");
  }
  const value = data as Partial<CaptionResult>;
  if (
    typeof value.safe !== "boolean" ||
    typeof value.reason !== "string" ||
    !Array.isArray(value.captions)
  ) {
    throw new CaptionAiError("reply does not match the schema");
  }
  if (!value.safe) return { safe: false, reason: value.reason, captions: [] };
  const captions = value.captions
    .map((caption) => ({
      top: cleanLine(String(caption?.top ?? "")),
      bottom: cleanLine(String(caption?.bottom ?? "")),
    }))
    .filter((caption) => caption.top || caption.bottom);
  if (captions.length !== 3) {
    throw new CaptionAiError("reply does not have 3 captions");
  }
  return { safe: true, reason: value.reason, captions };
};

export const openAiCaptions = (opts: OpenAiOptions): CaptionAi => {
  const base = opts.baseUrl ?? "https://api.openai.com/v1";
  const doFetch = opts.fetch ?? fetch;

  const post = async (path: string, body: unknown) => {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CaptionAiError("openai request failed");
    }
    if (!res.ok) throw new CaptionAiError(`openai returned ${res.status}`);
    return (await res.json()) as any;
  };

  return {
    analyse: async (jpeg) => {
      const image = `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
      const reply = await post("/chat/completions", {
        model: opts.model,
        ...(opts.model.startsWith("gpt-5")
          ? { reasoning_effort: "minimal" }
          : {}),
        response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Review this photo and caption it." },
              { type: "image_url", image_url: { url: image, detail: "low" } },
            ],
          },
        ],
      });
      return parseResult(reply?.choices?.[0]?.message?.content);
    },
    moderateText: async (text) => {
      const reply = await post("/moderations", {
        model: "omni-moderation-latest",
        input: text,
      });
      const flagged = reply?.results?.[0]?.flagged;
      if (typeof flagged !== "boolean") {
        throw new CaptionAiError("moderation reply is malformed");
      }
      return flagged;
    },
  };
};
