import { describe, expect, test } from "bun:test";
import { CaptionAiError, cleanLine, openAiCaptions } from "../src/ai/captions";

/*
 * A fake fetch records each request and answers with a canned OpenAI reply, so no network is used.
 */
const fakeFetch = (reply: unknown, status = 200) => {
  const calls: { url: string; body: any; headers: Headers }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      headers: new Headers(init.headers),
    });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
};

const chat = (content: unknown) => ({
  choices: [{ message: { content: JSON.stringify(content) } }],
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);

describe("openAiCaptions.analyse", () => {
  test("sends the image with a strict schema and cleans the captions", async () => {
    const { fn, calls } = fakeFetch(
      chat({
        safe: true,
        reason: "",
        captions: [
          { top: "  gm   ser ", bottom: "wen moon" },
          { top: "one two three four five six seven", bottom: "" },
          { top: "", bottom: "diamond hands" },
        ],
      }),
    );
    const ai = openAiCaptions({ apiKey: "k", model: "gpt-5-mini", fetch: fn });
    const result = await ai.analyse(jpeg);

    expect(result).toEqual({
      safe: true,
      reason: "",
      captions: [
        { top: "GM SER", bottom: "WEN MOON" },
        { top: "ONE TWO THREE FOUR FIVE SIX", bottom: "" },
        { top: "", bottom: "DIAMOND HANDS" },
      ],
    });
    const [call] = calls;
    expect(call!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call!.headers.get("authorization")).toBe("Bearer k");
    expect(call!.body.model).toBe("gpt-5-mini");
    expect(call!.body.reasoning_effort).toBe("minimal");
    expect(call!.body.response_format.json_schema.name).toBe("meme_review");
    expect(call!.body.response_format.json_schema.strict).toBe(true);
    const image = call!.body.messages[1].content[1].image_url;
    expect(image.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(image.detail).toBe("low");
  });

  test("omits reasoning_effort for non gpt-5 models", async () => {
    const { fn, calls } = fakeFetch(
      chat({ safe: false, reason: "gore", captions: [] }),
    );
    const ai = openAiCaptions({
      apiKey: "k",
      model: "gpt-4.1-mini",
      fetch: fn,
    });
    expect(await ai.analyse(jpeg)).toEqual({
      safe: false,
      reason: "gore",
      captions: [],
    });
    expect(calls[0]!.body.reasoning_effort).toBeUndefined();
  });

  test("maps bad replies and http errors to CaptionAiError", async () => {
    const bad = [
      fakeFetch({ choices: [{ message: { content: "not json" } }] }).fn,
      fakeFetch(chat({ safe: "yes" })).fn,
      fakeFetch(
        chat({ safe: true, reason: "", captions: [{ top: "a", bottom: "" }] }),
      ).fn,
      fakeFetch({ error: "nope" }, 500).fn,
      (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    ];
    for (const fn of bad) {
      const ai = openAiCaptions({ apiKey: "k", model: "m", fetch: fn });
      await expect(ai.analyse(jpeg)).rejects.toBeInstanceOf(CaptionAiError);
    }
  });
});

describe("openAiCaptions.moderateText", () => {
  test("returns the flagged verdict", async () => {
    const { fn, calls } = fakeFetch({ results: [{ flagged: true }] });
    const ai = openAiCaptions({ apiKey: "k", model: "m", fetch: fn });
    expect(await ai.moderateText("some text")).toBe(true);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/moderations");
    expect(calls[0]!.body).toEqual({
      model: "omni-moderation-latest",
      input: "some text",
    });
  });

  test("rejects a malformed reply", async () => {
    const ai = openAiCaptions({
      apiKey: "k",
      model: "m",
      fetch: fakeFetch({ results: [] }).fn,
    });
    await expect(ai.moderateText("x")).rejects.toBeInstanceOf(CaptionAiError);
  });
});

describe("cleanLine", () => {
  test("caps words and characters", () => {
    expect(cleanLine("a".repeat(80))).toHaveLength(60);
    expect(cleanLine(" hodl  it ")).toBe("HODL IT");
  });
});
