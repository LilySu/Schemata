import type { NodeTypes } from "@xyflow/react";

import { ApiNode } from "./api-node";
import { ConfigNode } from "./config-node";
import { DatabaseNode } from "./database-node";
import { ExternalNode } from "./external-node";
import { FileNode } from "./file-node";
import { FunctionNode } from "./function-node";
import { ServiceNode } from "./service-node";

export const nodeTypes: NodeTypes = {
  service: ServiceNode,
  api: ApiNode,
  database: DatabaseNode,
  external: ExternalNode,
  config: ConfigNode,
  file: FileNode,
  function: FunctionNode,
};
