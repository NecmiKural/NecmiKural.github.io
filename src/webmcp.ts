// Registers the page's WebMCP tools (scripts/webmcp.ts) with the browser. main.ts loads this chunk
// only where the browser offers the API, so it carries its own copy of the content file.

import data from "../content/portfolio.json";
import type { Portfolio } from "../scripts/render.ts";
import { webmcpTools } from "../scripts/webmcp.ts";

export interface ModelContext {
  registerTool(tool: object): unknown;
}

export async function register(context: ModelContext): Promise<void> {
  for (const tool of webmcpTools(data as unknown as Portfolio)) await context.registerTool(tool);
}
