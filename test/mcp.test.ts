import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server completes the stdio handshake and lists its tool", async () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cursorWorkingDirectory = path.resolve(projectRoot, "..", "..");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      path.join(projectRoot, "node_modules", "tsx", "dist", "loader.mjs"),
      path.join(projectRoot, "src", "mcp.ts"),
    ],
    cwd: cursorWorkingDirectory,
    env: {
      MEMAI_API_URL: "http://localhost:4317",
      PATH: process.env.PATH ?? "",
    },
  });
  const client = new Client({ name: "memai-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ["create_memai"]);
  } finally {
    await client.close();
  }
});
