import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";
import { imageQualities } from "./types.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = moduleDirectory.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(moduleDirectory, "..", "..")
  : path.resolve(moduleDirectory, "..");
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

const apiUrl = process.env.MEMAI_API_URL ?? "http://localhost:4317";
const apiToken = process.env.MEMAI_API_TOKEN ?? process.env.API_TOKEN;

const server = new McpServer({
  name: "memai",
  version: "0.1.0",
});

server.registerTool(
  "create_memai",
  {
    title: "Create funny image",
    description: "Generate an original, funny reaction image from a short text idea.",
    inputSchema: z.object({
      prompt: z.string().min(1).max(1_000).describe("The situation, reaction, or visual joke"),
      quality: z.enum(imageQualities).optional().describe("Low is fastest and cheapest"),
    }),
  },
  async ({ prompt, quality }) => {
    const response = await fetch(new URL("/v1/images", apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
      },
      body: JSON.stringify({ prompt, ...(quality ? { quality } : {}) }),
    });
    const result = (await response.json()) as {
      error?: string;
      url?: string;
      mimeType?: string;
    };

    if (!response.ok || !result.url) {
      return {
        isError: true,
        content: [{ type: "text", text: result.error ?? `Image API returned ${response.status}` }],
      };
    }

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [{ type: "text", text: `Created: ${result.url}` }];

    try {
      const imageResponse = await fetch(result.url);
      if (imageResponse.ok) {
        content.push({
          type: "image",
          data: Buffer.from(await imageResponse.arrayBuffer()).toString("base64"),
          mimeType: result.mimeType ?? "image/jpeg",
        });
      }
    } catch {
      // The URL remains useful when the client cannot fetch the inline preview.
    }

    return { content };
  },
);

await server.connect(new StdioServerTransport());
