import raw from "./catalog.generated.json";

export type ToolParam = {
  name: string;
  type: string;
  optional: boolean;
  enum?: string[];
  description?: string;
};

export type ToolEntry = {
  name: string;
  description: string;
  file: string;
  group: string;
  groupOrder: number;
  actions: string[];
  params: ToolParam[];
};

export type Catalog = {
  generatedAt: string;
  serverVersion: string;
  packageVersion: string;
  pluginVersion: string;
  toolCount: number;
  tools: ToolEntry[];
};

export const catalog = raw as Catalog;
export const tools = catalog.tools;
export const toolCount = catalog.toolCount;
export const serverVersion = catalog.serverVersion;
export const pluginVersion = catalog.pluginVersion;
