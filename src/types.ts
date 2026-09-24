export type VariableRole =
  | "exposure"
  | "outcome"
  | "covariate";

export type MeasurementStatus =
  | "observed"
  | "unobserved";

export interface CausalNodeData extends Record<string, unknown> {
  label: string;
  englishLabel?: string;
  role: VariableRole;
  measurement: MeasurementStatus;
  time?: string;
  note?: string;
  adjusted?: boolean;
  selected?: boolean;
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
