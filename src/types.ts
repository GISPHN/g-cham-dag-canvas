export type VariableRole =
  | "exposure"
  | "outcome"
  | "covariate"
  | "unmeasured"
  | "selection";

export type MeasurementStatus =
  | "measured"
  | "planned"
  | "unmeasured"
  | "unavailable";

export interface CausalNodeData {
  label: string;
  englishLabel?: string;
  role: VariableRole;
  measurement: MeasurementStatus;
  time?: string;
  note?: string;
  adjusted?: boolean;
}

export interface QuestionFramework {
  mode: "HAPECOM" | "PECO" | "PICO";
  values: Record<string, string>;
}

export interface ProjectState {
  schemaVersion: 1;
  title: string;
  question: QuestionFramework;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: CausalNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}
