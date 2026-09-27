import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { CausalNodeData } from "../types";
import {
  diagnoseBackdoorPathsForExposures,
  forbiddenSetForAdjustment,
  minimalAdjustmentSetsForExposures,
  properDirectedPathsForExposures,
} from "./graph";

type GNode = Node<CausalNodeData>;

function node(id: string, role: CausalNodeData["role"] = "covariate"): GNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id, role, measurement: "observed" },
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe("generalized adjustment criterion", () => {
  it("finds a common-cause adjustment set", () => {
    const nodes = [node("L"), node("X", "exposure"), node("Y", "outcome")];
    const edges = [edge("L", "X"), edge("L", "Y"), edge("X", "Y")];

    const paths = diagnoseBackdoorPathsForExposures(
      edges,
      ["X"],
      "Y",
      new Set(),
    );
    expect(paths.some((p) => p.active && p.nodes.join(",") === "X,L,Y")).toBe(true);

    const sets = minimalAdjustmentSetsForExposures(nodes, edges, ["X"], "Y");
    expect(sets).toContainEqual(["L"]);
  });

  it("keeps a collider path closed until the collider is conditioned on", () => {
    const edges = [edge("X", "C"), edge("Y", "C")];

    const closed = diagnoseBackdoorPathsForExposures(
      edges,
      ["X"],
      "Y",
      new Set(),
    );
    expect(closed).toHaveLength(1);
    expect(closed[0].active).toBe(false);

    const opened = diagnoseBackdoorPathsForExposures(
      edges,
      ["X"],
      "Y",
      new Set(["C"]),
    );
    expect(opened[0].active).toBe(true);
  });

  it("marks mediators and their descendants as forbidden for total-effect adjustment", () => {
    const edges = [
      edge("X", "M"),
      edge("M", "Y"),
      edge("X", "Y"),
      edge("M", "D"),
    ];

    const forbidden = forbiddenSetForAdjustment(edges, ["X"], "Y");
    expect(forbidden.has("M")).toBe(true);
    expect(forbidden.has("D")).toBe(true);
    expect(forbidden.has("X")).toBe(true);

    const nodes = [
      node("X", "exposure"),
      node("M"),
      node("D"),
      node("Y", "outcome"),
    ];
    const sets = minimalAdjustmentSetsForExposures(nodes, edges, ["X"], "Y");
    expect(sets).toEqual([[]]);
  });

  it("uses proper causal paths for a treatment set", () => {
    const edges = [edge("X1", "X2"), edge("X2", "Y")];
    const paths = properDirectedPathsForExposures(edges, ["X1", "X2"], "Y");

    expect(paths).toHaveLength(1);
    expect(paths[0]).toEqual({ exposureId: "X2", nodes: ["X2", "Y"] });
  });

  it("matches the multiple-treatment DAG pattern from Perkovic et al. Example 9", () => {
    const nodes = [
      node("X1", "exposure"),
      node("X2", "exposure"),
      node("V1"),
      node("V2"),
      node("V3"),
      node("Y", "outcome"),
    ];
    const edges = [
      edge("X2", "V1"),
      edge("V1", "X1"),
      edge("V2", "X1"),
      edge("V3", "V2"),
      edge("X2", "Y"),
      edge("V3", "Y"),
      edge("X1", "Y"),
    ];

    const sets = minimalAdjustmentSetsForExposures(
      nodes,
      edges,
      ["X1", "X2"],
      "Y",
    );

    expect(sets).toContainEqual(["V2"]);
    expect(sets).toContainEqual(["V3"]);
    expect(sets).toHaveLength(2);
  });
});
