import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { CausalNodeData } from "../types";

type CausalFlowNode = Node<CausalNodeData>;

export default function CausalNode({ data, selected }: NodeProps<CausalFlowNode>) {
  const classes = [
    "causal-node",
    "node-" + data.role,
    data.adjusted ? "node-adjusted" : "",
    data.measurement === "unobserved" ? "node-unobserved" : "",
    data.selected ? "node-selected" : "",
    selected ? "node-current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className="handle handle-left handle-target"
      />
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="handle handle-left handle-source"
      />

      <div className="node-label">{data.label}</div>
      <div className="node-badges">
        {data.measurement === "unobserved" && <span>未観測</span>}
        {data.adjusted && <span>調整</span>}
        {data.selected && <span>Selected</span>}
      </div>

      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="handle handle-right handle-target"
      />
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className="handle handle-right handle-source"
      />
    </div>
  );
}
