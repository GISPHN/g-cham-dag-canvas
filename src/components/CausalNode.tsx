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
      <Handle id="top" type="source" position={Position.Top} className="handle handle-top" />
      <Handle id="right" type="source" position={Position.Right} className="handle handle-right" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="handle handle-bottom" />
      <Handle id="left" type="source" position={Position.Left} className="handle handle-left" />

      <div className="node-label">{data.label}</div>
      <div className="node-badges">
        {selected && <span className="selected-badge">選択中</span>}
        {data.measurement === "unobserved" && <span>未観測</span>}
        {data.adjusted && <span>調整</span>}
        {data.selected && <span>Selected</span>}
      </div>
    </div>
  );
}
