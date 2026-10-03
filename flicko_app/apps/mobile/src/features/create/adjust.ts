import {
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
  type SkPaint,
  type SkRuntimeEffect,
} from "@shopify/react-native-skia";

import type { Adjust } from "./store";

/*
 * The photo's look in one shader: catalog filter colour matrix, then the Adjust sliders
 * (Light: brightness, contrast, shadows, highlights; Color: saturation, warmth, tint;
 * Detail: sharpness, vignette). It runs in the photo's own pixel space, so the screen
 * and the full-size export get the same result at any scale.
 */
const SKSL = `
uniform shader image;
uniform float4 m0;
uniform float4 m1;
uniform float4 m2;
uniform float4 m3;
uniform float4 mo;
uniform float brightness;
uniform float contrast;
uniform float shadows;
uniform float highlights;
uniform float saturation;
uniform float warmth;
uniform float tint;
uniform float sharpness;
uniform float vignette;
uniform float2 texel;
uniform float4 frame;

float luma(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

half4 main(float2 p) {
  float4 c = float4(image.eval(p));
  if (sharpness != 0.0) {
    float4 blur = (float4(image.eval(p + float2(texel.x, 0.0)))
      + float4(image.eval(p - float2(texel.x, 0.0)))
      + float4(image.eval(p + float2(0.0, texel.y)))
      + float4(image.eval(p - float2(0.0, texel.y)))) * 0.25;
    c.rgb = sharpness > 0.0
      ? c.rgb + (c.rgb - blur.rgb) * sharpness * 1.5
      : mix(c.rgb, blur.rgb, -sharpness);
  }
  float3 rgb = float3(dot(m0, c), dot(m1, c), dot(m2, c)) + mo.rgb;
  rgb += brightness * 0.25;
  rgb = (rgb - 0.5) * (1.0 + contrast * 0.6) + 0.5;
  float l = luma(rgb);
  rgb += shadows * 0.3 * (1.0 - smoothstep(0.0, 0.55, l));
  rgb += highlights * 0.3 * smoothstep(0.45, 1.0, l);
  l = luma(rgb);
  rgb = mix(float3(l), rgb, 1.0 + saturation);
  rgb.r += warmth * 0.08;
  rgb.b -= warmth * 0.08;
  rgb.g -= tint * 0.06;
  float2 q = (p - frame.xy) / frame.zw - 0.5;
  float d = length(q) * 1.41421;
  rgb *= 1.0 - vignette * 0.75 * smoothstep(0.35, 1.0, d);
  return half4(half3(clamp(rgb, 0.0, 1.0)), 1.0);
}
`;

let effect: SkRuntimeEffect | null | undefined;
const getEffect = () => {
  if (effect === undefined) {
    effect = Skia.RuntimeEffect.Make(SKSL);
    if (!effect) console.warn("[create] adjust shader failed to compile");
  }
  return effect;
};

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/*
 * Paint for drawing `photo` at (0, 0) in its own pixels. `frame` is the visible part
 * (the crop) in photo pixels, for the vignette; `texel` is one output pixel in photo
 * pixels, so sharpening looks the same on screen and in the export.
 */
export const photoPaint = (
  photo: SkImage,
  adjust: Adjust,
  matrix: number[] | undefined,
  frame: { x: number; y: number; width: number; height: number },
  texel: number,
): SkPaint => {
  const paint = Skia.Paint();
  const image = photo.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None,
  );
  const runtime = getEffect();
  if (!runtime) {
    paint.setShader(image);
    if (matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
    return paint;
  }
  const m = matrix ?? IDENTITY;
  const row = (r: number) => m.slice(r * 5, r * 5 + 4);
  const v = (key: keyof Adjust) => adjust[key] / 100;
  paint.setShader(
    runtime.makeShaderWithChildren(
      [
        ...row(0),
        ...row(1),
        ...row(2),
        ...row(3),
        m[4],
        m[9],
        m[14],
        m[19],
        v("brightness"),
        v("contrast"),
        v("shadows"),
        v("highlights"),
        v("saturation"),
        v("warmth"),
        v("tint"),
        v("sharpness"),
        v("vignette"),
        texel,
        texel,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
      ],
      [image],
    ),
  );
  return paint;
};
