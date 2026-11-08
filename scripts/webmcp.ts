// The WebMCP tools the page registers where the browser offers document.modelContext, an
// experimental API (https://webmachinelearning.github.io/webmcp/). They only read, and they answer
// from the same content file as the page, so an agent gets what a visitor reads. Pure: src/webmcp.ts
// registers them; tests/webmcp.test.ts checks them.

import { factsOf, isSite, SITE, type Portfolio } from "./render.ts";

type Input = Record<string, unknown> | undefined;
export interface WebTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, object>; required?: string[]; additionalProperties: false };
  annotations: { readOnlyHint: true };
  execute: (input: Input) => Promise<object>;
}

// Input reaches the tool from an agent: only a value from the list is accepted.
function oneOf(input: Input, key: string, allowed: string[], required: boolean): string | undefined {
  const value = input?.[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  return value;
}

export function webmcpTools(data: Portfolio): WebTool[] {
  const { name, headline } = data.profile;
  const ids = data.projects.map((p) => p.id);
  const groups = [...new Set(data.projects.map((p) => p.group))];
  const annotations = { readOnlyHint: true } as const;
  const page = (id: string) => `${SITE}#${id}`;
  return [
    {
      name: "portfolio.getProfile",
      title: `About ${name}`,
      description: `${name}'s headline, education and location, and links to the profiles listed on this page (GitHub, LinkedIn and the others) and the CV.`,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations,
      execute: async () => ({
        name,
        headline,
        about: factsOf(data.profile),
        links: data.links.filter((l) => !isSite(l.url)).map((l) => ({ label: l.label, url: l.url })),
        page: SITE,
      }),
    },
    {
      name: "portfolio.listProjects",
      title: "List the projects",
      description: `Every project on this page, in page order: id, title, group, one-line summary, stack and links. Pass a group (${groups.join(", ")}) to list only that one; portfolio.getProject gives the details.`,
      inputSchema: {
        type: "object",
        properties: { group: { type: "string", enum: groups, description: "Only the projects in this group." } },
        additionalProperties: false,
      },
      annotations,
      execute: async (input) => {
        const group = oneOf(input, "group", groups, false);
        return {
          projects: data.projects
            .filter((p) => !group || p.group === group)
            .map((p) => ({ id: p.id, title: p.title, group: p.group, short: p.short, stack: p.stack, repo: p.urls.repo, demo: p.urls.demo, page: page(p.id) })),
        };
      },
    },
    {
      name: "portfolio.getProject",
      title: "Read one project",
      description: `One project as this page shows it: its summary, its measured claims, each quoted word for word from the README at the source link, its links and anything a visitor can try.`,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", enum: ids, description: "A project id, as portfolio.listProjects gives it." } },
        required: ["id"],
        additionalProperties: false,
      },
      annotations,
      execute: async (input) => {
        const id = oneOf(input, "id", ids, true);
        const p = data.projects.find((x) => x.id === id) as Portfolio["projects"][number];
        const { visual: _, extra, ...urls } = p.urls;
        const links = Object.fromEntries([...Object.entries(urls), ...extra.map((e) => [e.label, e.url])].filter(([, u]) => u));
        return {
          id: p.id,
          title: p.title,
          byline: p.byline,
          summary: p.card,
          stack: p.stack,
          claims: p.claims.map((c) => ({ lead: c.lead ?? "", text: c.text, source: c.source })),
          links,
          try: data.try.filter((t) => t.project === p.id).map((t) => ({ name: t.name, kind: t.kind, url: t.url, see: t.see, note: t.note ?? "" })),
          page: page(p.id),
        };
      },
    },
  ];
}
