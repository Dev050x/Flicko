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
  label?: string;
  jsonMode?: "json_schema" | "json_object";
  textModeration?: "moderations" | "chat";
  fetch?: typeof fetch;
}

const MAX_WORDS = 6;
const MAX_CHARS = 60;

export const SYSTEM_PROMPT = `You review photos for Flicko, an app that turns photos into meme coins.

Safety: set safe=false for nudity or sexual content, anyone who looks like a minor in a sexual or harmful context, graphic violence or gore, hate symbols, self-harm, or visible personal documents (IDs, bank cards, addresses). Ordinary photos of people, pets, food, objects and places are safe. When unsafe, give a short reason and return three empty captions.

Captions: write 3 different classic top/bottom meme captions about what is actually in the photo. At most 6 words per line. Crypto-native humour (gm, ser, wagmi, ngmi, diamond hands, rug, moon, wen, degen) used naturally, not in every line. No slurs, no real people's names, no hashtags, no emojis. One line may be empty but not both.`;

const JSON_SHAPE = `Reply with json only, exactly this shape: {"safe": boolean, "reason": string, "captions": [{"top": string, "bottom": string}, {"top": string, "bottom": string}, {"top": string, "bottom": string}]}`;

const MODERATION_PROMPT = `You moderate user-written meme captions for Flicko. Flag slurs, hate, harassment, sexual content involving minors, threats, self-harm encouragement, or real people's names used to insult them. Crude crypto humour and mild swearing are fine. Reply with json only: {"flagged": boolean}`;

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

const parseJson = (content: unknown) => {
  if (typeof content !== "string") throw new CaptionAiError("empty reply");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new CaptionAiError("reply is not json");
  }
};

const parseResult = (content: unknown): CaptionResult => {
  const value = parseJson(content) as Partial<CaptionResult>;
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
  const label = opts.label ?? "openai";
  const jsonMode = opts.jsonMode ?? "json_schema";
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
      throw new CaptionAiError(`${label} request failed`);
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as {
        error?: { code?: string; type?: string };
      } | null;
      const code = detail?.error?.code ?? detail?.error?.type ?? "unknown";
      throw new CaptionAiError(`${label} returned ${res.status} (${code})`);
    }
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
        response_format:
          jsonMode === "json_schema"
            ? { type: "json_schema", json_schema: RESPONSE_SCHEMA }
            : { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              jsonMode === "json_schema"
                ? SYSTEM_PROMPT
                : `${SYSTEM_PROMPT}\n\n${JSON_SHAPE}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Review this photo and caption it." },
              { type: "image_url", image_url: { url: image, detail: "low" } },
            ],
          },
        ],
      });
      const choice = reply?.choices?.[0];
      if (choice?.finish_reason === "content_filter") {
        return {
          safe: false,
          reason: "blocked by content filter",
          captions: [],
        };
      }
      return parseResult(choice?.message?.content);
    },
    moderateText: async (text) => {
      if (opts.textModeration === "chat") {
        const reply = await post("/chat/completions", {
          model: opts.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: MODERATION_PROMPT },
            { role: "user", content: text },
          ],
        });
        const choice = reply?.choices?.[0];
        if (choice?.finish_reason === "content_filter") return true;
        const flagged = (
          parseJson(choice?.message?.content) as {
            flagged?: unknown;
          }
        )?.flagged;
        if (typeof flagged !== "boolean") {
          throw new CaptionAiError("moderation reply is malformed");
        }
        return flagged;
      }
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

export const deepSeekCaptions = (
  opts: Pick<OpenAiOptions, "apiKey" | "model" | "fetch">,
): CaptionAi =>
  openAiCaptions({
    ...opts,
    baseUrl: "https://api.deepseek.com",
    label: "deepseek",
    jsonMode: "json_object",
    textModeration: "chat",
  });
