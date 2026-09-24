import { useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Download, FilePlus2, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import CausalNode from "./components/CausalNode";
import type { CausalNodeData, ProjectState, QuestionFramework, VariableRole } from "./types";
import {
  classifyRelativeRoles,
  diagnoseBackdoorPaths,
  directedPaths,
  hasDirectedCycle,
  minimalAdjustmentSets,
} from "./lib/graph";
import { downloadProject, loadProject, readProjectFile, saveProject } from "./lib/storage";

const frameworkFields: Record<QuestionFramework["mode"], Array<{ key: string; label: string; hint: string }>> = {
  HAPECOM: [
    { key: "H", label: "H: Helpful", hint: "この研究結果は誰の、何の役に立つか" },
    { key: "A", label: "A: Area", hint: "対象地域" },
    { key: "P", label: "P: Participants", hint: "対象者・集団" },
    { key: "E", label: "E: Exposure", hint: "曝露・介入・要因" },
    { key: "C", label: "C: Comparison", hint: "比較" },
    { key: "O", label: "O: Outcome", hint: "アウトカム" },
    { key: "M", label: "M: Measurable", hint: "測定可能性・利用可能なデータ" },
  ],
  PECO: [
    { key: "P", label: "P: Population", hint: "対象者・集団" },
    { key: "E", label: "E: Exposure", hint: "曝露" },
    { key: "C", label: "C: Comparison", hint: "比較" },
    { key: "O", label: "O: Outcome", hint: "アウトカム" },
  ],
  PICO: [
    { key: "P", label: "P: Population", hint: "対象者・集団" },
    { key: "I", label: "I: Intervention", hint: "介入" },
    { key: "C", label: "C: Comparison", hint: "比較" },
    { key: "O", label: "O: Outcome", hint: "アウトカム" },
  ],
};

const roleLabels: Record<VariableRole, string> = {
  exposure: "曝露・介入",
  outcome: "アウトカム",
  covariate: "共変量",
};

const measurementLabels = {
  observed: "観測あり（Observed）",
  unobserved: "未観測・潜在（Unobserved / Latent）",
} as const;

const nodeTypes = { causal: CausalNode };

function starterProject(): ProjectState {
  return {
    schemaVersion: 1,
    title: "運動と心血管疾患",
    question: {
      mode: "PECO",
      values: { P: "成人", E: "運動", C: "運動量が少ない群", O: "心血管疾患" },
    },
    nodes: [
      { id: "age", position: { x: 90, y: 90 }, data: { label: "年齢", role: "covariate", measurement: "observed" } },
      { id: "exercise", position: { x: 330, y: 180 }, data: { label: "運動", role: "exposure", measurement: "observed" } },
      { id: "cvd", position: { x: 640, y: 180 }, data: { label: "心血管疾患", role: "outcome", measurement: "observed" } },
    ],
    edges: [
      { id: "e-age-ex", source: "age", target: "exercise" },
      { id: "e-age-cvd", source: "age", target: "cvd" },
      { id: "e-ex-cvd", source: "exercise", target: "cvd" },
    ],
  };
}

function normalizeNode(n: ProjectState["nodes"][number]): Node<CausalNodeData> {
  const legacyRole = n.data.role as string;
  const legacyMeasurement = n.data.measurement as string;
  const role: VariableRole =
    legacyRole === "exposure" || legacyRole === "outcome" ? legacyRole : "covariate";
  const measurement =
    legacyRole === "unmeasured" ||
    legacyMeasurement === "unmeasured" ||
    legacyMeasurement === "unavailable"
      ? "unobserved"
      : "observed";
  const selected = Boolean(n.data.selected || legacyRole === "selection");

  return {
    ...n,
    type: "causal",
    data: { ...n.data, role, measurement, selected },
  };
}

function normalizeEdge(e: ProjectState["edges"][number]): Edge {
  return { ...e, markerEnd: { type: MarkerType.ArrowClosed } };
}

export default function App() {
  const restored = useMemo(() => loadProject(), []);
  const initial: ProjectState = restored ?? {
    schemaVersion: 1,
    title: "無題の研究",
    question: { mode: "HAPECOM", values: {} },
    nodes: [],
    edges: [],
  };

  const [title, setTitle] = useState(initial.title);
  const [question, setQuestion] = useState<QuestionFramework>(initial.question);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CausalNodeData>>(initial.nodes.map(normalizeNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges.map(normalizeEdge));
  const [newVariable, setNewVariable] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState(restored ? "前回の内容を復元しました" : "新しいプロジェクト");
  const [graphNotice, setGraphNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setViewport } = useReactFlow();

  const exposure = nodes.find((n) => n.data.role === "exposure");
  const outcome = nodes.find((n) => n.data.role === "outcome");
  const adjusted = useMemo(
    () => new Set(nodes.filter((n) => n.data.adjusted).map((n) => n.id)),
    [nodes],
  );
  const selectedForAnalysis = useMemo(
    () => new Set(nodes.filter((n) => n.data.selected).map((n) => n.id)),
    [nodes],
  );
  const conditioned = useMemo(
    () => new Set([...adjusted, ...selectedForAnalysis]),
    [adjusted, selectedForAnalysis],
  );
  const cycle = useMemo(() => hasDirectedCycle(nodes, edges), [nodes, edges]);

  const diagnostics = useMemo(() => {
    if (!exposure || !outcome || cycle) return null;
    const baselineBackdoor = diagnoseBackdoorPaths(
      edges,
      exposure.id,
      outcome.id,
      selectedForAnalysis,
    );
    const backdoor = diagnoseBackdoorPaths(edges, exposure.id, outcome.id, conditioned);
    const minimal = minimalAdjustmentSets(
      nodes,
      edges,
      exposure.id,
      outcome.id,
      12,
      selectedForAnalysis,
    );
    return {
      baselineBackdoor,
      backdoor,
      directed: directedPaths(edges, exposure.id, outcome.id),
      minimal,
      roles: classifyRelativeRoles(nodes, edges, exposure.id, outcome.id, minimal),
    };
  }, [nodes, edges, conditioned, selectedForAnalysis, exposure, outcome, cycle]);

  const labelFor = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id;

  const project = useMemo<ProjectState>(
    () => ({
      schemaVersion: 1,
      title,
      question,
      nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }),
    [title, question, nodes, edges],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveProject(project);
      setSaveMessage("自動保存済み");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project]);

  const styledNodes = nodes;

  const pathEdgeKey = (a: string, b: string) => [a, b].sort().join("::");

  const displayEdges = useMemo(() => {
    const activeKeys = new Set<string>();
    const blockedKeys = new Set<string>();

    diagnostics?.backdoor.forEach((path) => {
      for (let i = 0; i < path.nodes.length - 1; i++) {
        const key = pathEdgeKey(path.nodes[i], path.nodes[i + 1]);
        if (path.active) activeKeys.add(key);
        else blockedKeys.add(key);
      }
    });

    return edges.map((edge) => {
      const key = pathEdgeKey(edge.source, edge.target);
      if (activeKeys.has(key)) {
        return {
          ...edge,
          style: { stroke: "#c2413b", strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#c2413b" },
          animated: true,
        };
      }
      if (conditioned.size > 0 && blockedKeys.has(key)) {
        return {
          ...edge,
          style: { stroke: "#9aa3b2", strokeWidth: 2, strokeDasharray: "6 5", opacity: 0.55 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#9aa3b2" },
          animated: false,
        };
      }
      return {
        ...edge,
        style: { stroke: "#4c586c", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#4c586c" },
        animated: false,
      };
    });
  }, [edges, diagnostics, conditioned]);

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const duplicate = edges.some(
      (e) => e.source === connection.source && e.target === connection.target,
    );
    if (duplicate) {
      setGraphNotice("同じ向きの矢印はすでに存在します。");
      return;
    }

    const candidate: Edge = {
      ...connection,
      id: "e-" + connection.source + "-" + connection.target + "-" + Date.now(),
      markerEnd: { type: MarkerType.ArrowClosed },
    };

    if (hasDirectedCycle(nodes, [...edges, candidate])) {
      setGraphNotice("この矢印を追加すると有向サイクルが生じるため、DAGにはできません。");
      return;
    }

    setGraphNotice(null);
    setEdges((eds) => addEdge(candidate, eds));
  };

  const addVariable = (label = newVariable, role: VariableRole = "covariate") => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const id = "n-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);

    const canvasRect = canvasWrapRef.current?.getBoundingClientRect();
    const stagger = nodes.length % 4;
    const position = canvasRect
      ? screenToFlowPosition({
          x: canvasRect.left + 150 + stagger * 34,
          y: canvasRect.top + 105 + stagger * 26,
        })
      : { x: 140 + stagger * 34, y: 100 + stagger * 26 };

    setNodes((ns) => {
      const demoted = ns.map((n) => {
        if (role === "exposure" && n.data.role === "exposure") return { ...n, data: { ...n.data, role: "covariate" as VariableRole } };
        if (role === "outcome" && n.data.role === "outcome") return { ...n, data: { ...n.data, role: "covariate" as VariableRole } };
        return n;
      });
      return [
        ...demoted,
        {
          id,
          type: "causal",
          position,
          data: { label: trimmed, role, measurement: "observed", adjusted: false, selected: false },
        },
      ];
    });

    setNewVariable("");
    setSelectedNodeId(id);
  };

  const addQuestionNodes = () => {
    const exposureKey = question.mode === "PICO" ? "I" : "E";
    const e = question.values[exposureKey]?.trim();
    const o = question.values.O?.trim();
    if (e && !nodes.some((n) => n.data.label === e)) addVariable(e, "exposure");
    if (o && !nodes.some((n) => n.data.label === o)) addVariable(o, "outcome");
  };

  const updateSelected = (patch: Partial<CausalNodeData>) => {
    if (!selectedNodeId) return;
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== selectedNodeId) {
          if (patch.role === "exposure" && n.data.role === "exposure") return { ...n, data: { ...n.data, role: "covariate" } };
          if (patch.role === "outcome" && n.data.role === "outcome") return { ...n, data: { ...n.data, role: "covariate" } };
          return n;
        }
        return { ...n, data: { ...n.data, ...patch } };
      }),
    );
  };

  const selected = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const newProject = () => {
    const hasContent =
      nodes.length > 0 ||
      edges.length > 0 ||
      title !== "無題の研究" ||
      Object.values(question.values).some((value) => value.trim().length > 0);

    if (
      hasContent &&
      !window.confirm(
        "現在の研究内容を消去して、新しい研究を開始します。保存していない内容は失われます。よろしいですか？",
      )
    ) {
      return;
    }

    setTitle("無題の研究");
    setQuestion({ mode: "HAPECOM", values: {} });
    setNodes([]);
    setEdges([]);
    setNewVariable("");
    setSelectedNodeId(null);
    setSaveMessage("新しいプロジェクト");
    void setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 });
  };

  const loadStarter = () => {
    const p = starterProject();
    setTitle(p.title);
    setQuestion(p.question);
    setNodes(p.nodes.map(normalizeNode));
    setEdges(p.edges.map(normalizeEdge));
    setSelectedNodeId(null);
  };

  const applyAdjustmentSet = (ids: string[]) => {
    const set = new Set(ids);
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, adjusted: set.has(n.id) } })));
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const p = await readProjectFile(file);
      setTitle(p.title);
      setQuestion(p.question);
      setNodes(p.nodes.map(normalizeNode));
      setEdges(p.edges.map(normalizeEdge));
      setSelectedNodeId(null);
      setSaveMessage("ファイルを読み込みました");
    } catch (error) {
      alert(error instanceof Error ? error.message : "読み込みに失敗しました。");
    }
  };

  const activeBackdoors = diagnostics?.backdoor.filter((p) => p.active) ?? [];
  const baselineActiveBackdoors = diagnostics?.baselineBackdoor.filter((p) => p.active) ?? [];
  const adjustedCollider = diagnostics?.roles.colliders.filter((id) => conditioned.has(id)) ?? [];
  const adjustedMediator = diagnostics?.roles.mediators.filter((id) => adjusted.has(id)) ?? [];
  const confoundingExists = baselineActiveBackdoors.length > 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">G-CHAM DAG Canvas</div>
          <div className="subtitle">研究質問から因果仮定、調整までを一つの画面で</div>
        </div>
        <div className="top-actions">
          <span className="save-state"><Save size={15} /> {saveMessage}</span>
          <button className="secondary new-project-button" onClick={newProject}><FilePlus2 size={16} /> 新規作成</button>
          <button className="secondary" onClick={loadStarter}><RotateCcw size={16} /> 例題</button>
          <button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> 読込</button>
          <button className="primary" onClick={() => downloadProject(project)}><Download size={16} /> 保存</button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
      </header>

      <main className="workspace">
        <aside className="panel left-panel">
          <section>
            <label className="field-label">研究名</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </section>

          <section>
            <div className="section-title">研究質問を整理する</div>
            <div className="tabs">
              {(["HAPECOM", "PECO", "PICO"] as const).map((mode) => (
                <button
                  key={mode}
                  className={question.mode === mode ? "tab active" : "tab"}
                  onClick={() => setQuestion((q) => ({ ...q, mode }))}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="framework-fields">
              {frameworkFields[question.mode].map((field) => (
                <label key={field.key} className="framework-field">
                  <span>{field.label}</span>
                  <textarea
                    rows={2}
                    placeholder={field.hint}
                    value={question.values[field.key] ?? ""}
                    onChange={(e) =>
                      setQuestion((q) => ({
                        ...q,
                        values: { ...q.values, [field.key]: e.target.value },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button className="secondary wide" onClick={addQuestionNodes}>
              Exposure / Intervention と Outcome をDAGへ
            </button>
            <p className="microcopy">ノードだけを追加します。因果関係の矢印は自動では作成しません。</p>
          </section>
        </aside>

        <section className="canvas-column">
          <div className="canvas-toolbar">
            <div className="new-variable">
              <input
                placeholder="変数名を入力"
                value={newVariable}
                onChange={(e) => setNewVariable(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addVariable()}
              />
              <button className="primary" onClick={() => addVariable()}><Plus size={16} /> 変数追加</button>
            </div>
            {selected && (
              <div className="selected-editor">
                <span className="selected-name">{selected.data.label}</span>
                <div className="editor-group">
                  <span className="editor-label">変数の種類</span>
                  <select value={selected.data.role} onChange={(e) => updateSelected({ role: e.target.value as VariableRole })}>
                    {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="editor-group">
                  <span className="editor-label">観測状態</span>
                  <select
                    value={selected.data.measurement}
                    onChange={(e) => updateSelected({ measurement: e.target.value as CausalNodeData["measurement"] })}
                  >
                    {Object.entries(measurementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.data.adjusted)}
                    onChange={(e) => updateSelected({ adjusted: e.target.checked })}
                  />
                  調整する（Adjusted）
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.data.selected)}
                    onChange={(e) => updateSelected({ selected: e.target.checked })}
                  />
                  選択条件あり（Selected）
                </label>
                <button className="icon-danger" title="変数を削除" onClick={deleteSelected}><Trash2 size={16} /></button>
              </div>
            )}
          </div>

          <div className="canvas-wrap" ref={canvasWrapRef}>
            <ReactFlow
              nodes={styledNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              connectionMode={ConnectionMode.Loose}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={24} size={1} />
              {graphNotice && <div className="graph-notice">{graphNotice}</div>}
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
            <div className="legend">
              <span className="legend-item"><i className="dot exposure" />曝露・介入</span>
              <span className="legend-item"><i className="dot outcome" />アウトカム</span>
              <span className="legend-item"><i className="dot covariate" />共変量</span>
              <span className="legend-item"><i className="dot adjusted" />Adjusted</span>
              <span className="legend-item"><i className="dot unmeasured" />Unobserved / Latent</span>
            </div>
          </div>
        </section>

        <aside className="panel right-panel">
          <div className="section-title">因果推論診断</div>
          <div className="assumption-note">
            ここでの判定は、入力した因果仮定を前提にしたグラフ上の結果です。
          </div>

          <div className={cycle ? "diagnostic-card danger" : "diagnostic-card ok"}>
            <div className="card-title">DAGとしての構造</div>
            <div>{cycle ? "有向サイクルがあります。DAGになるよう矢印を見直してください。" : "有向サイクルは検出されていません。"}</div>
          </div>

          {!exposure || !outcome ? (
            <div className="diagnostic-card">
              <div className="card-title">まず設定してください</div>
              <div>曝露とアウトカムを1つずつ指定すると、バックドアパスと調整候補を解析します。</div>
            </div>
          ) : !cycle && diagnostics ? (
            <>
              <div className="diagnostic-card">
                <div className="card-title">因果経路</div>
                <div className="metric">{diagnostics.directed.length} 本</div>
                {diagnostics.directed.length === 0 && <div className="muted">曝露からアウトカムへの有向経路がありません。</div>}
              </div>

              <div className={confoundingExists ? "diagnostic-card warn" : "diagnostic-card ok"}>
                <div className="card-title">交絡とバックドアパス</div>
                <div className="metric">
                  {confoundingExists ? "交絡あり" : "交絡を示す開いたバックドアパスなし"}
                </div>
                {confoundingExists && adjusted.size > 0 && (
                  <div className={activeBackdoors.length === 0 ? "adjustment-status ok-text" : "adjustment-status warn-text"}>
                    {activeBackdoors.length === 0
                      ? "現在の調整で、開いていたバックドアパスはすべて遮断されています。"
                      : `調整後も ${activeBackdoors.length} 本のバックドアパスが開いています。`}
                  </div>
                )}
                <div className="microcopy">
                  赤い矢印は現在開いているバックドアパス、灰色の破線は条件付けで閉じた経路です。
                </div>
                <div className="path-list">
                  {diagnostics.backdoor.slice(0, 8).map((p, i) => (
                    <div key={i} className={p.active ? "path active-path" : "path blocked-path"}>
                      {p.nodes.map(labelFor).join(" — ")}
                      <span>{p.active ? "　開" : "　閉"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="diagnostic-card">
                <div className="card-title">最小調整集合の候補</div>
                {diagnostics.minimal.length === 0 ? (
                  <div className="muted">現在の候補変数だけでは調整集合を見つけられませんでした。</div>
                ) : (
                  diagnostics.minimal.map((set, i) => (
                    <button key={i} className="adjustment-set" onClick={() => applyAdjustmentSet(set)}>
                      {set.length === 0 ? "調整不要" : set.map(labelFor).join(" ＋ ")}
                    </button>
                  ))
                )}
                <div className="microcopy">クリックすると現在の調整セットとして反映します。</div>
              </div>

              {adjustedCollider.length > 0 && (
                <div className="diagnostic-card danger">
                  <div className="card-title">コライダーへの条件付けに注意</div>
                  <div>{adjustedCollider.map(labelFor).join("、")} に条件付けています。Adjusted または Selected により、閉じていた経路が開く可能性があります。</div>
                </div>
              )}

              {adjustedMediator.length > 0 && (
                <div className="diagnostic-card warn">
                  <div className="card-title">媒介経路への調整</div>
                  <div>{adjustedMediator.map(labelFor).join("、")} は曝露からアウトカムへの有向経路上にあります。総効果を対象とする場合は調整目的を確認してください。</div>
                </div>
              )}

              {nodes.some((n) => n.data.measurement === "unobserved") && (
                <div className="diagnostic-card">
                  <div className="card-title">未観測・潜在変数</div>
                  <div>未観測・潜在（Unobserved / Latent）として指定した変数があります。必要なバックドアパスを観測変数で遮断できない場合、未測定交絡が残る可能性があります。</div>
                </div>
              )}
            </>
          ) : null}

          {selected && diagnostics && (
            <div className="diagnostic-card">
              <div className="card-title">選択中の変数：DAG上の役割</div>
              <div className="role-summary">
                {diagnostics.roles.confounders.includes(selected.id) && (
                  <span className="role-pill">交絡因子（Confounder）</span>
                )}
                {diagnostics.roles.mediators.includes(selected.id) && <span className="role-pill">媒介変数（Mediator）</span>}
                {diagnostics.roles.colliders.includes(selected.id) && <span className="role-pill">コライダー（Collider：経路依存）</span>}
                {diagnostics.minimal.some((set) => set.includes(selected.id)) && <span className="role-pill">最小十分調整集合の構成変数</span>}
                {diagnostics.roles.colliderPaths
                  .filter((item) => item.nodeId === selected.id)
                  .slice(0, 3)
                  .map((item, i) => (
                    <div className="role-path" key={i}>
                      Colliderとなる経路：{item.path.map(labelFor).join(" — ")}
                    </div>
                  ))}
                {!diagnostics.roles.confounders.includes(selected.id) &&
                  !diagnostics.roles.mediators.includes(selected.id) &&
                  !diagnostics.roles.colliders.includes(selected.id) &&
                  !diagnostics.minimal.some((set) => set.includes(selected.id)) && (
                    <span className="muted">現在のExposureとOutcomeに対する主要な構造上の役割は検出されていません。</span>
                  )}
              </div>
            </div>
          )}

          <div className="diagnostic-card concept">
            <div className="card-title">因果推論チェック</div>
            <ul className="checklist">
              <li>因果質問は十分に具体的か</li>
              <li>介入・曝露は明確に定義されているか</li>
              <li>交換可能性の仮定は妥当か</li>
              <li>Positivity は確保できそうか</li>
              <li>Consistency を考えられる定義になっているか</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
