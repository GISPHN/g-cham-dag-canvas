import type { Edge, Node } from "@xyflow/react";
import type { CausalNodeData } from "../types";

type GraphNode = Node<CausalNodeData>;
type GraphEdge = Edge;

export interface PathDiagnostic {
  exposureId: string;
  nodes: string[];
  colliderIds: string[];
  active: boolean;
}

export interface ProperCausalPath {
  exposureId: string;
  nodes: string[];
}

function edgeKey(source: string, target: string) {
  return `${source}→${target}`;
}

function edgeExists(edges: GraphEdge[], source: string, target: string) {
  return edges.some((e) => e.source === source && e.target === target);
}

function neighbors(edges: GraphEdge[], id: string) {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return [...out];
}

export function descendants(edges: GraphEdge[], start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    for (const e of edges) {
      if (e.source === current && !seen.has(e.target)) {
        seen.add(e.target);
        stack.push(e.target);
      }
    }
  }
  seen.delete(start);
  return seen;
}

export function hasDirectedCycle(nodes: GraphNode[], edges: GraphEdge[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const e of edges) {
      if (e.source === id && visit(e.target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return nodes.some((n) => visit(n.id));
}

export function directedPaths(
  edges: GraphEdge[],
  source: string,
  target: string,
  maxPaths = 200,
): string[][] {
  const results: string[][] = [];
  const walk = (current: string, path: string[]) => {
    if (results.length >= maxPaths) return;
    if (current === target) {
      results.push(path);
      return;
    }
    for (const e of edges) {
      if (e.source === current && !path.includes(e.target)) {
        walk(e.target, [...path, e.target]);
      }
    }
  };
  walk(source, [source]);
  return results;
}

function properDirectedPathsFromExposure(
  edges: GraphEdge[],
  exposure: string,
  exposureSet: Set<string>,
  outcome: string,
  maxPaths = 200,
): string[][] {
  const results: string[][] = [];

  const walk = (current: string, path: string[]) => {
    if (results.length >= maxPaths) return;
    if (current === outcome) {
      results.push(path);
      return;
    }

    for (const e of edges) {
      if (e.source !== current || path.includes(e.target)) continue;
      if (e.target !== outcome && exposureSet.has(e.target)) continue;
      walk(e.target, [...path, e.target]);
    }
  };

  walk(exposure, [exposure]);
  return results;
}

export function properDirectedPathsForExposures(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  maxPathsPerExposure = 200,
): ProperCausalPath[] {
  const exposureSet = new Set(exposures);
  return exposures.flatMap((exposureId) =>
    properDirectedPathsFromExposure(
      edges,
      exposureId,
      exposureSet,
      outcome,
      maxPathsPerExposure,
    ).map((nodes) => ({ exposureId, nodes })),
  );
}

// Backwards-compatible alias. For a treatment set, causal-path counts should use
// proper causal paths: no selected exposure may appear internally on the path.
export function directedPathsForExposures(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  maxPathsPerExposure = 200,
) {
  return properDirectedPathsForExposures(
    edges,
    exposures,
    outcome,
    maxPathsPerExposure,
  );
}

function allSimpleUndirectedPaths(
  edges: GraphEdge[],
  source: string,
  target: string,
  maxPaths = 1000,
): string[][] {
  const results: string[][] = [];
  const walk = (current: string, path: string[]) => {
    if (results.length >= maxPaths) return;
    if (current === target) {
      results.push(path);
      return;
    }
    for (const n of neighbors(edges, current)) {
      if (!path.includes(n)) walk(n, [...path, n]);
    }
  };
  walk(source, [source]);
  return results;
}

function isProperPath(path: string[], exposureSet: Set<string>) {
  return path.slice(1).every((id) => !exposureSet.has(id));
}

function isCollider(edges: GraphEdge[], left: string, center: string, right: string) {
  return edgeExists(edges, left, center) && edgeExists(edges, right, center);
}

function colliderHasConditionedDescendant(
  edges: GraphEdge[],
  collider: string,
  conditioned: Set<string>,
) {
  if (conditioned.has(collider)) return true;
  const ds = descendants(edges, collider);
  return [...conditioned].some((id) => ds.has(id));
}

function pathDiagnostic(
  edges: GraphEdge[],
  exposureId: string,
  path: string[],
  conditionedIds: Set<string>,
): PathDiagnostic {
  const colliderIds: string[] = [];
  let active = true;

  for (let i = 1; i < path.length - 1; i++) {
    const left = path[i - 1];
    const center = path[i];
    const right = path[i + 1];
    const collider = isCollider(edges, left, center, right);

    if (collider) {
      colliderIds.push(center);
      if (!colliderHasConditionedDescendant(edges, center, conditionedIds)) {
        active = false;
      }
    } else if (conditionedIds.has(center)) {
      active = false;
    }
  }

  return { exposureId, nodes: path, colliderIds, active };
}

export function properBackdoorGraph(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
): GraphEdge[] {
  const causalPaths = properDirectedPathsForExposures(edges, exposures, outcome);
  const firstCausalEdges = new Set<string>();

  for (const path of causalPaths) {
    if (path.nodes.length >= 2) {
      firstCausalEdges.add(edgeKey(path.nodes[0], path.nodes[1]));
    }
  }

  return edges.filter(
    (e) => !firstCausalEdges.has(edgeKey(e.source, e.target)),
  );
}

export function causalNodesForAdjustment(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
): Set<string> {
  const causalNodes = new Set<string>();
  for (const path of properDirectedPathsForExposures(edges, exposures, outcome)) {
    path.nodes.slice(1).forEach((id) => causalNodes.add(id));
  }
  return causalNodes;
}

export function forbiddenSetForAdjustment(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
): Set<string> {
  const forbidden = new Set<string>(exposures);
  const causalNodes = causalNodesForAdjustment(edges, exposures, outcome);

  for (const node of causalNodes) {
    forbidden.add(node);
    descendants(edges, node).forEach((id) => forbidden.add(id));
  }

  return forbidden;
}

export function diagnoseBackdoorPathsForExposures(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  conditionedIds: Set<string>,
): PathDiagnostic[] {
  if (exposures.length === 0) return [];

  const exposureSet = new Set(exposures);
  const pbdEdges = properBackdoorGraph(edges, exposures, outcome);

  return exposures.flatMap((exposureId) =>
    allSimpleUndirectedPaths(pbdEdges, exposureId, outcome)
      .filter((path) => isProperPath(path, exposureSet))
      .map((path) =>
        pathDiagnostic(pbdEdges, exposureId, path, conditionedIds),
      ),
  );
}

export function diagnoseBackdoorPaths(
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  conditionedIds: Set<string>,
): PathDiagnostic[] {
  return diagnoseBackdoorPathsForExposures(
    edges,
    [exposure],
    outcome,
    conditionedIds,
  );
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const out: T[][] = [];
  for (let i = 0; i <= items.length - size; i++) {
    for (const tail of combinations(items.slice(i + 1), size - 1)) {
      out.push([items[i], ...tail]);
    }
  }
  return out;
}

function isSubset(subset: string[], superset: string[]) {
  const set = new Set(superset);
  return subset.every((id) => set.has(id));
}

export function isValidAdjustmentSetForExposures(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  adjustmentIds: Set<string>,
) {
  const forbidden = forbiddenSetForAdjustment(edges, exposures, outcome);
  const forbiddenAdjusted = [...adjustmentIds].filter((id) => forbidden.has(id));
  const paths = diagnoseBackdoorPathsForExposures(
    edges,
    exposures,
    outcome,
    adjustmentIds,
  );

  return {
    valid:
      forbiddenAdjusted.length === 0 &&
      paths.every((path) => !path.active),
    forbiddenAdjusted,
    paths,
  };
}

export function minimalAdjustmentSetsForExposures(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  limitCandidates = 12,
  fixedConditioned: Set<string> = new Set(),
): string[][] {
  if (exposures.length === 0) return [];

  const forbidden = forbiddenSetForAdjustment(edges, exposures, outcome);
  if ([...fixedConditioned].some((id) => forbidden.has(id))) return [];

  const exposureSet = new Set(exposures);
  const eligible = nodes
    .filter(
      (n) =>
        !exposureSet.has(n.id) &&
        n.id !== outcome &&
        !forbidden.has(n.id) &&
        n.data.measurement !== "unobserved" &&
        !n.data.selected,
    )
    .map((n) => n.id)
    .slice(0, limitCandidates);

  const baseline = isValidAdjustmentSetForExposures(
    edges,
    exposures,
    outcome,
    fixedConditioned,
  );
  if (baseline.valid) return [[]];

  const minimal: string[][] = [];
  for (let size = 1; size <= eligible.length; size++) {
    for (const candidate of combinations(eligible, size)) {
      if (minimal.some((m) => isSubset(m, candidate))) continue;
      const conditioned = new Set([...fixedConditioned, ...candidate]);
      const result = isValidAdjustmentSetForExposures(
        edges,
        exposures,
        outcome,
        conditioned,
      );
      if (result.valid) minimal.push(candidate);
    }
  }

  return minimal.slice(0, 20);
}

export function minimalAdjustmentSets(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  limitCandidates = 12,
  fixedConditioned: Set<string> = new Set(),
): string[][] {
  return minimalAdjustmentSetsForExposures(
    nodes,
    edges,
    [exposure],
    outcome,
    limitCandidates,
    fixedConditioned,
  );
}

export function classifyRelativeRolesForExposures(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  minimalSets: string[][] = [],
) {
  const causalPaths = properDirectedPathsForExposures(edges, exposures, outcome);
  const mediators = new Set<string>();
  for (const path of causalPaths) {
    path.nodes.slice(1, -1).forEach((id) => mediators.add(id));
  }

  const pbdEdges = properBackdoorGraph(edges, exposures, outcome);
  const exposureSet = new Set(exposures);
  const colliders = new Set<string>();
  const colliderPaths: Array<{
    nodeId: string;
    path: string[];
    exposureId: string;
  }> = [];

  for (const exposureId of exposures) {
    const paths = allSimpleUndirectedPaths(pbdEdges, exposureId, outcome)
      .filter((path) => isProperPath(path, exposureSet));
    for (const path of paths) {
      for (let i = 1; i < path.length - 1; i++) {
        if (isCollider(pbdEdges, path[i - 1], path[i], path[i + 1])) {
          colliders.add(path[i]);
          colliderPaths.push({ nodeId: path[i], path, exposureId });
        }
      }
    }
  }

  const adjustmentVariables = new Set<string>();
  for (const set of minimalSets) {
    set.forEach((id) => adjustmentVariables.add(id));
  }

  return {
    mediators: [...mediators],
    colliders: [...colliders],
    colliderPaths,
    adjustmentVariables: [...adjustmentVariables],
    forbidden: [...forbiddenSetForAdjustment(edges, exposures, outcome)],
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
  };
}

export function classifyRelativeRoles(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  minimalSets: string[][] = [],
) {
  return classifyRelativeRolesForExposures(
    nodes,
    edges,
    [exposure],
    outcome,
    minimalSets,
  );
}
