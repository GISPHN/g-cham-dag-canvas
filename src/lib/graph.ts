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

export function directedCycleEdgeIds(edges: GraphEdge[]): Set<string> {
  const cycleEdges = new Set<string>();

  const canReach = (
    start: string,
    target: string,
    skippedEdgeId: string,
  ): boolean => {
    const seen = new Set<string>();
    const stack = [start];

    while (stack.length) {
      const current = stack.pop()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);

      for (const edge of edges) {
        if (edge.id === skippedEdgeId || edge.source !== current) continue;
        if (!seen.has(edge.target)) stack.push(edge.target);
      }
    }

    return false;
  };

  for (const edge of edges) {
    if (canReach(edge.target, edge.source, edge.id)) {
      cycleEdges.add(edge.id);
    }
  }

  return cycleEdges;
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

type UndirectedGraph = Map<string, Set<string>>;

export interface AdjustmentEnumerationResult {
  sets: string[][];
  truncated: boolean;
  exploredStates: number;
}

function ancestorClosure(edges: GraphEdge[], seeds: Iterable<string>): Set<string> {
  const ancestors = new Set<string>(seeds);
  const stack = [...ancestors];

  while (stack.length) {
    const current = stack.pop()!;
    for (const edge of edges) {
      if (edge.target === current && !ancestors.has(edge.source)) {
        ancestors.add(edge.source);
        stack.push(edge.source);
      }
    }
  }

  return ancestors;
}

function moralize(
  edges: GraphEdge[],
  vertices: Set<string>,
): UndirectedGraph {
  const graph: UndirectedGraph = new Map();
  for (const id of vertices) graph.set(id, new Set());

  const addUndirected = (a: string, b: string) => {
    if (a === b || !vertices.has(a) || !vertices.has(b)) return;
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  };

  const parentsByChild = new Map<string, string[]>();

  for (const edge of edges) {
    if (!vertices.has(edge.source) || !vertices.has(edge.target)) continue;
    addUndirected(edge.source, edge.target);

    const parents = parentsByChild.get(edge.target) ?? [];
    parents.push(edge.source);
    parentsByChild.set(edge.target, parents);
  }

  for (const parents of parentsByChild.values()) {
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        addUndirected(parents[i], parents[j]);
      }
    }
  }

  return graph;
}

function findUndirectedPath(
  graph: UndirectedGraph,
  starts: Iterable<string>,
  target: string,
  removed: Set<string>,
): string[] | null {
  if (removed.has(target)) return null;

  const queue: string[] = [];
  const previous = new Map<string, string | null>();

  for (const start of starts) {
    if (removed.has(start) || !graph.has(start)) continue;
    queue.push(start);
    previous.set(start, null);
  }

  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) {
      const path: string[] = [];
      let cursor: string | null = current;
      while (cursor !== null) {
        path.push(cursor);
        cursor = previous.get(cursor) ?? null;
      }
      return path.reverse();
    }

    for (const next of graph.get(current) ?? []) {
      if (removed.has(next) || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }

  return null;
}

function dSeparatedInProperBackdoorGraph(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  conditioned: Set<string>,
) {
  const pbdEdges = properBackdoorGraph(edges, exposures, outcome);
  const ancestors = ancestorClosure(
    pbdEdges,
    [...exposures, outcome, ...conditioned],
  );
  const moral = moralize(pbdEdges, ancestors);
  return findUndirectedPath(moral, exposures, outcome, conditioned) === null;
}

export function isValidAdjustmentSetForExposures(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  adjustmentIds: Set<string>,
) {
  const forbidden = forbiddenSetForAdjustment(edges, exposures, outcome);
  const forbiddenAdjusted = [...adjustmentIds].filter((id) => forbidden.has(id));

  return {
    valid:
      forbiddenAdjusted.length === 0 &&
      dSeparatedInProperBackdoorGraph(
        edges,
        exposures,
        outcome,
        adjustmentIds,
      ),
    forbiddenAdjusted,
    paths: diagnoseBackdoorPathsForExposures(
      edges,
      exposures,
      outcome,
      adjustmentIds,
    ),
  };
}

function canonicalSetKey(ids: Iterable<string>) {
  return [...ids].sort().join("\u0000");
}

function isSubset(subset: string[], superset: Set<string>) {
  return subset.every((id) => superset.has(id));
}

function minimizeAdjustmentSet(
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  fixedConditioned: Set<string>,
  candidate: Set<string>,
) {
  const minimal = new Set(candidate);

  for (const id of [...minimal]) {
    const trial = new Set([...fixedConditioned, ...minimal]);
    trial.delete(id);
    if (
      isValidAdjustmentSetForExposures(
        edges,
        exposures,
        outcome,
        trial,
      ).valid
    ) {
      minimal.delete(id);
    }
  }

  return [...minimal].sort();
}

/**
 * Enumerate inclusion-minimal sufficient adjustment sets without imposing a
 * candidate-count cutoff.
 *
 * The DAG is transformed to the proper back-door graph, restricted to the
 * relevant ancestral graph, then moralized. Minimal adjustment is reduced to
 * an allowed minimal vertex-separator problem. Search branches only on
 * vertices lying on a currently open X-Y path rather than enumerating 2^n
 * covariate subsets.
 *
 * maxResults limits returned results, not the number of candidate variables.
 */
export function enumerateMinimalAdjustmentSetsForExposures(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  fixedConditioned: Set<string> = new Set(),
  maxResults = 50,
): AdjustmentEnumerationResult {
  if (exposures.length === 0 || maxResults <= 0) {
    return { sets: [], truncated: false, exploredStates: 0 };
  }

  const forbidden = forbiddenSetForAdjustment(edges, exposures, outcome);
  if ([...fixedConditioned].some((id) => forbidden.has(id))) {
    return { sets: [], truncated: false, exploredStates: 0 };
  }

  const baseline = isValidAdjustmentSetForExposures(
    edges,
    exposures,
    outcome,
    fixedConditioned,
  );
  if (baseline.valid) {
    return { sets: [[]], truncated: false, exploredStates: 1 };
  }

  const pbdEdges = properBackdoorGraph(edges, exposures, outcome);
  const relevantAncestors = ancestorClosure(
    pbdEdges,
    [...exposures, outcome, ...fixedConditioned],
  );
  const moral = moralize(pbdEdges, relevantAncestors);
  const exposureSet = new Set(exposures);

  const allowed = new Set(
    nodes
      .filter(
        (node) =>
          relevantAncestors.has(node.id) &&
          !exposureSet.has(node.id) &&
          node.id !== outcome &&
          !forbidden.has(node.id) &&
          node.data.measurement !== "unobserved" &&
          !node.data.selected,
      )
      .map((node) => node.id),
  );

  const fixedRemoved = new Set(fixedConditioned);
  const results: string[][] = [];
  const resultKeys = new Set<string>();
  const visited = new Set<string>();
  let exploredStates = 0;
  let truncated = false;

  const search = (chosen: Set<string>) => {
    if (results.length >= maxResults) {
      truncated = true;
      return;
    }

    const stateKey = canonicalSetKey(chosen);
    if (visited.has(stateKey)) return;
    visited.add(stateKey);
    exploredStates += 1;

    if (results.some((result) => isSubset(result, chosen))) return;

    const removed = new Set([...fixedRemoved, ...chosen]);
    const openPath = findUndirectedPath(
      moral,
      exposures,
      outcome,
      removed,
    );

    if (!openPath) {
      const minimal = minimizeAdjustmentSet(
        edges,
        exposures,
        outcome,
        fixedConditioned,
        chosen,
      );
      const conditioned = new Set([...fixedConditioned, ...minimal]);
      const validity = isValidAdjustmentSetForExposures(
        edges,
        exposures,
        outcome,
        conditioned,
      );
      if (!validity.valid) return;

      const key = canonicalSetKey(minimal);
      if (!resultKeys.has(key)) {
        resultKeys.add(key);
        results.push(minimal);
      }
      return;
    }

    const branchVertices = openPath
      .slice(1, -1)
      .filter((id) => allowed.has(id) && !chosen.has(id));

    if (branchVertices.length === 0) return;

    branchVertices.sort(
      (a, b) => (moral.get(b)?.size ?? 0) - (moral.get(a)?.size ?? 0),
    );

    for (const id of branchVertices) {
      const next = new Set(chosen);
      next.add(id);
      search(next);
      if (results.length >= maxResults) {
        truncated = true;
        return;
      }
    }
  };

  search(new Set());

  results.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));

  return { sets: results, truncated, exploredStates };
}

export function minimalAdjustmentSetsForExposures(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposures: string[],
  outcome: string,
  maxResults = 50,
  fixedConditioned: Set<string> = new Set(),
): string[][] {
  return enumerateMinimalAdjustmentSetsForExposures(
    nodes,
    edges,
    exposures,
    outcome,
    fixedConditioned,
    maxResults,
  ).sets;
}

export function minimalAdjustmentSets(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  maxResults = 50,
  fixedConditioned: Set<string> = new Set(),
): string[][] {
  return minimalAdjustmentSetsForExposures(
    nodes,
    edges,
    [exposure],
    outcome,
    maxResults,
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
