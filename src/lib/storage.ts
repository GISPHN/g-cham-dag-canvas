import type { ProjectState } from "../types";

const STORAGE_KEY = "g-cham-dag-canvas:v1";

export function saveProject(project: ProjectState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadProject(): ProjectState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectState;
    if (parsed.schemaVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function downloadProject(project: ProjectState) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (project.title || "g-cham-dag-project")
    .replace(/[^a-zA-Z0-9\u3040-\u30ff\u3400-\u9fff_-]+/g, "_")
    .slice(0, 80);
  a.href = url;
  a.download = `${safeName || "g-cham-dag-project"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<ProjectState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectState;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("対応していないプロジェクト形式です。");
  }
  return parsed;
}
