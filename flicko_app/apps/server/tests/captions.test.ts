import { describe, expect, test } from "bun:test";
import {
  CaptionAiError,
  cleanLine,
  deepSeekCaptions,
  openAiCaptions,
} from "../src/ai/captions";

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

  test("puts the openai error code in the message", async () => {
    const ai = openAiCaptions({
      apiKey: "k",
      model: "m",
      fetch: fakeFetch({ error: { code: "credit_balance_exhausted" } }, 429).fn,
    });
    await expect(ai.analyse(jpeg)).rejects.toThrow(
      "openai returned 429 (credit_balance_exhausted)",
    );
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

describe("deepSeekCaptions", () => {
  test("uses json_object mode with the shape in the prompt", async () => {
    const { fn, calls } = fakeFetch(
      chat({
        safe: true,
        reason: "",
        captions: [
          { top: "gm", bottom: "ser" },
          { top: "wen", bottom: "moon" },
          { top: "", bottom: "ngmi" },
        ],
      }),
    );
    const ai = deepSeekCaptions({
      apiKey: "k",
      model: "deepseek-flash",
      fetch: fn,
    });
    expect((await ai.analyse(jpeg)).captions).toHaveLength(3);
    const [call] = calls;
    expect(call!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(call!.body.response_format).toEqual({ type: "json_object" });
    expect(call!.body.reasoning_effort).toBeUndefined();
    expect(call!.body.messages[0].content).toContain('"captions"');
    expect(call!.body.messages[0].content).toContain("json");
  });

  test("treats a content-filter stop as unsafe", async () => {
    const { fn } = fakeFetch({
      choices: [{ finish_reason: "content_filter", message: { content: "" } }],
    });
    const ai = deepSeekCaptions({ apiKey: "k", model: "m", fetch: fn });
    expect(await ai.analyse(jpeg)).toMatchObject({ safe: false, captions: [] });
  });

  test("moderates captions with a json chat call", async () => {
    const { fn, calls } = fakeFetch(chat({ flagged: true }));
    const ai = deepSeekCaptions({ apiKey: "k", model: "m", fetch: fn });
    expect(await ai.moderateText("some text")).toBe(true);
    expect(calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0]!.body.messages[1]).toEqual({
      role: "user",
      content: "some text",
    });

    const bad = deepSeekCaptions({
      apiKey: "k",
      model: "m",
      fetch: fakeFetch(chat({ verdict: "no" })).fn,
    });
    await expect(bad.moderateText("x")).rejects.toBeInstanceOf(CaptionAiError);
  });

  test("labels errors with the provider", async () => {
    const ai = deepSeekCaptions({
      apiKey: "k",
      model: "m",
      fetch: fakeFetch({ error: { type: "authentication_error" } }, 401).fn,
    });
    await expect(ai.analyse(jpeg)).rejects.toThrow(
      "deepseek returned 401 (authentication_error)",
    );
  });
});

describe("cleanLine", () => {
  test("caps words and characters", () => {
    expect(cleanLine("a".repeat(80))).toHaveLength(60);
    expect(cleanLine(" hodl  it ")).toBe("HODL IT");
  });
});
