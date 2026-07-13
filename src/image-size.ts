const MIN_PROVIDER_PIXELS = 655_360;
const MAX_PROVIDER_PIXELS = 8_294_400;
const MAX_PROVIDER_EDGE = 3_840;
const EDGE_MULTIPLE = 16;
const MAX_ASPECT_RATIO = 3;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageSizePlan {
  output: ImageDimensions;
  provider: ImageDimensions;
  providerSize: string;
  needsResize: boolean;
}

export function parseImageSize(size: string): ImageDimensions {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) throw new Error("IMAGE_SIZE must use the format WIDTHxHEIGHT");

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("IMAGE_SIZE dimensions must be positive integers");
  }

  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  if (aspectRatio > MAX_ASPECT_RATIO) {
    throw new Error("IMAGE_SIZE cannot have an aspect ratio wider than 3:1");
  }

  return { width, height };
}

function roundUp(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

export function planImageSize(size: string): ImageSizePlan {
  const output = parseImageSize(size);
  const scale = Math.max(1, Math.sqrt(MIN_PROVIDER_PIXELS / (output.width * output.height)));
  const provider = {
    width: roundUp(output.width * scale, EDGE_MULTIPLE),
    height: roundUp(output.height * scale, EDGE_MULTIPLE),
  };
  const providerPixels = provider.width * provider.height;

  if (
    provider.width > MAX_PROVIDER_EDGE ||
    provider.height > MAX_PROVIDER_EDGE ||
    providerPixels > MAX_PROVIDER_PIXELS
  ) {
    throw new Error("IMAGE_SIZE exceeds GPT Image 2's maximum output dimensions");
  }

  return {
    output,
    provider,
    providerSize: `${provider.width}x${provider.height}`,
    needsResize: provider.width !== output.width || provider.height !== output.height,
  };
}
