import type { Edge, Node } from "@xyflow/react";
import type { CausalNodeData } from "../types";

type GraphNode = Node<CausalNodeData>;
type GraphEdge = Edge;

export interface PathDiagnostic {
  nodes: string[];
  colliderIds: string[];
  active: boolean;
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

function allSimpleUndirectedPaths(
  edges: GraphEdge[],
  source: string,
  target: string,
  maxPaths = 500,
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

function isCollider(edges: GraphEdge[], left: string, center: string, right: string) {
  return edgeExists(edges, left, center) && edgeExists(edges, right, center);
}

function colliderHasConditionedDescendant(
  edges: GraphEdge[],
  collider: string,
  adjusted: Set<string>,
) {
  if (adjusted.has(collider)) return true;
  const ds = descendants(edges, collider);
  return [...adjusted].some((id) => ds.has(id));
}

export function diagnoseBackdoorPaths(
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  adjustedIds: Set<string>,
): PathDiagnostic[] {
  return allSimpleUndirectedPaths(edges, exposure, outcome)
    .filter((path) => {
      if (path.length < 2) return false;
      const firstNeighbor = path[1];
      return edgeExists(edges, firstNeighbor, exposure);
    })
    .map((path) => {
      const colliderIds: string[] = [];
      let active = true;

      for (let i = 1; i < path.length - 1; i++) {
        const left = path[i - 1];
        const center = path[i];
        const right = path[i + 1];
        const collider = isCollider(edges, left, center, right);

        if (collider) {
          colliderIds.push(center);
          if (!colliderHasConditionedDescendant(edges, center, adjustedIds)) {
            active = false;
          }
        } else if (adjustedIds.has(center)) {
          active = false;
        }
      }

      return { nodes: path, colliderIds, active };
    });
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

export function minimalAdjustmentSets(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
  limitCandidates = 12,
  fixedConditioned: Set<string> = new Set(),
): string[][] {
  const exposureDescendants = descendants(edges, exposure);
  const eligible = nodes
    .filter(
      (n) =>
        n.id !== exposure &&
        n.id !== outcome &&
        !exposureDescendants.has(n.id) &&
        n.data.measurement !== "unobserved" &&
        !n.data.selected,
    )
    .map((n) => n.id)
    .slice(0, limitCandidates);

  const baseline = diagnoseBackdoorPaths(edges, exposure, outcome, fixedConditioned);
  if (baseline.every((p) => !p.active)) return [[]];

  const valid: string[][] = [];
  for (let size = 1; size <= eligible.length; size++) {
    for (const set of combinations(eligible, size)) {
      const adjusted = new Set([...fixedConditioned, ...set]);
      const paths = diagnoseBackdoorPaths(edges, exposure, outcome, adjusted);
      if (paths.every((p) => !p.active)) {
        const isSuperset = valid.some((v) => v.every((id) => adjusted.has(id)));
        if (!isSuperset) valid.push(set);
      }
    }
    if (valid.length) break;
  }
  return valid.slice(0, 10);
}

export function classifyRelativeRoles(
  nodes: GraphNode[],
  edges: GraphEdge[],
  exposure: string,
  outcome: string,
) {
  const directed = directedPaths(edges, exposure, outcome);
  const mediators = new Set<string>();
  for (const path of directed) {
    path.slice(1, -1).forEach((id) => mediators.add(id));
  }

  const allPaths = allSimpleUndirectedPaths(edges, exposure, outcome);
  const colliders = new Set<string>();
  for (const path of allPaths) {
    for (let i = 1; i < path.length - 1; i++) {
      if (isCollider(edges, path[i - 1], path[i], path[i + 1])) {
        colliders.add(path[i]);
      }
    }
  }

  return {
    mediators: [...mediators],
    colliders: [...colliders],
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
  };
}
