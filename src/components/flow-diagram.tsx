"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";

import type {
  GraphData,
  GraphEdge,
  GraphGroup,
  GraphItem,
  GraphNode,
} from "~/features/diagram/graph-types";
import { nodeTypes } from "./flow-nodes";

// --- Dagre layout ---

const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;
const GROUP_PADDING = 40;

function layoutGraph(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  graphGroups: GraphGroup[] = [],
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add group nodes
  const groupIds = new Set(graphGroups.map((gr) => gr.id));
  for (const group of graphGroups) {
    g.setNode(group.id, {
      label: group.label,
      width: NODE_WIDTH + GROUP_PADDING * 2,
      height: NODE_HEIGHT + GROUP_PADDING * 2,
    });
  }

  // Add nodes
  for (const node of graphNodes) {
    g.setNode(node.id, { label: node.label, width: NODE_WIDTH, height: NODE_HEIGHT });
    if (node.group && groupIds.has(node.group)) {
      g.setParent(node.id, node.group);
    }
  }

  // Add edges (only if both endpoints exist)
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  for (const edge of graphEdges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  // Build group position map for relative child positioning
  const groupPositions = new Map<string, { x: number; y: number }>();
  for (const group of graphGroups) {
    const pos = g.node(group.id);
    if (pos) {
      groupPositions.set(group.id, {
        x: pos.x - (pos.width ?? 0) / 2,
        y: pos.y - (pos.height ?? 0) / 2,
      });
    }
  }

  const rfNodes: Node[] = [];

  // Add group nodes as parent containers
  for (const group of graphGroups) {
    const pos = g.node(group.id);
    if (!pos) continue;
    rfNodes.push({
      id: group.id,
      type: "group",
      position: { x: pos.x - (pos.width ?? 0) / 2, y: pos.y - (pos.height ?? 0) / 2 },
      data: { label: group.label },
      style: {
        width: pos.width,
        height: pos.height,
        border: "1px dashed rgba(150,150,150,0.5)",
        borderRadius: 8,
        backgroundColor: "rgba(150,150,150,0.05)",
        fontSize: 12,
        fontWeight: 600,
        padding: 8,
      },
    });
  }

  // Add regular nodes
  for (const node of graphNodes) {
    const pos = g.node(node.id);
    if (!pos) continue;

    const absoluteX = pos.x - NODE_WIDTH / 2;
    const absoluteY = pos.y - NODE_HEIGHT / 2;

    let position = { x: absoluteX, y: absoluteY };
    let parentId: string | undefined;

    if (node.group && groupPositions.has(node.group)) {
      const gp = groupPositions.get(node.group)!;
      position = { x: absoluteX - gp.x, y: absoluteY - gp.y };
      parentId = node.group;
    }

    rfNodes.push({
      id: node.id,
      type: node.type,
      position,
      parentId,
      data: {
        label: node.label,
        nodeType: node.type,
        clickUrl: node.clickUrl,
        clickAction: node.clickAction,
        clickPath: node.clickPath,
      },
      style: { width: NODE_WIDTH },
    });
  }

  // Build edges
  const rfEdges: Edge[] = graphEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((edge, i) => ({
      id: `e-${edge.source}-${edge.target}-${i}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.5 },
      labelStyle: { fontSize: 11 },
    }));

  return { rfNodes, rfEdges };
}

// --- Inner component (needs ReactFlow context) ---

interface FlowDiagramInnerProps {
  data?: GraphData | null;
  onNodeClick?: (path: string) => void;
}

function FlowDiagramInner({ data, onNodeClick }: FlowDiagramInnerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { fitView } = useReactFlow();

  // Accumulated items for progressive rendering
  const accNodesRef = useRef<GraphNode[]>([]);
  const accEdgesRef = useRef<GraphEdge[]>([]);
  const accGroupsRef = useRef<GraphGroup[]>([]);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const runLayout = useCallback(() => {
    const { rfNodes, rfEdges } = layoutGraph(
      accNodesRef.current,
      accEdgesRef.current,
      accGroupsRef.current,
    );
    setNodes(rfNodes);
    setEdges(rfEdges);
    // Delay fitView to let React render
    setTimeout(() => fitView({ padding: 0.1, duration: 200 }), 50);
  }, [setNodes, setEdges, fitView]);

  const scheduleLayout = useCallback(() => {
    if (layoutTimerRef.current) return; // already scheduled
    layoutTimerRef.current = setTimeout(() => {
      layoutTimerRef.current = null;
      runLayout();
    }, 200);
  }, [runLayout]);

  // Handle complete GraphData (static mode or final state)
  useEffect(() => {
    if (!data || data.nodes.length === 0) return;
    accNodesRef.current = data.nodes;
    accEdgesRef.current = data.edges;
    accGroupsRef.current = data.groups ?? [];
    runLayout();
  }, [data, runLayout]);

  // Expose addItem for progressive rendering
  const addItem = useCallback(
    (item: GraphItem) => {
      if (item.kind === "node") {
        // Avoid duplicates
        if (!accNodesRef.current.some((n) => n.id === item.id)) {
          accNodesRef.current = [...accNodesRef.current, item];
        }
      } else if (item.kind === "edge") {
        accEdgesRef.current = [...accEdgesRef.current, item];
      } else if (item.kind === "group") {
        if (!accGroupsRef.current.some((g) => g.id === item.id)) {
          accGroupsRef.current = [...accGroupsRef.current, item];
        }
      }
      scheduleLayout();
    },
    [scheduleLayout],
  );

  // Expose via window for the stream hook to call
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__flowDiagramAddItem = (
      item: GraphItem,
    ) => {
      addItem(item);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__flowDiagramAddItem;
    };
  }, [addItem]);

  // Reset accumulated data when data prop becomes null (new generation starting)
  useEffect(() => {
    if (data === null) {
      accNodesRef.current = [];
      accEdgesRef.current = [];
      accGroupsRef.current = [];
      setNodes([]);
      setEdges([]);
    }
  }, [data, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const clickUrl = node.data.clickUrl as string | undefined;
      const clickAction = node.data.clickAction as string | undefined;
      const clickPath = node.data.clickPath as string | undefined;

      if (clickAction === "drilldown" && clickPath && onNodeClick) {
        onNodeClick(clickPath);
      } else if (clickUrl) {
        window.open(clickUrl, "_blank", "noopener");
      }
    },
    [onNodeClick],
  );

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div className="h-[600px] w-full rounded-lg border-2 border-black dark:border-[#3b4656] dark:bg-[#1f2631]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        fitView
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        className={isDark ? "dark" : ""}
      >
        <Background gap={16} size={1} color={isDark ? "#2a3444" : "#e5e7eb"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// --- Outer wrapper with provider ---

interface FlowDiagramProps {
  data?: GraphData | null;
  onNodeClick?: (path: string) => void;
}

export default function FlowDiagram({ data, onNodeClick }: FlowDiagramProps) {
  return (
    <div className="w-full max-w-full p-4">
      <ReactFlowProvider>
        <FlowDiagramInner data={data} onNodeClick={onNodeClick} />
      </ReactFlowProvider>
    </div>
  );
}
