# G-CHAM DAG Canvas — Requirements

## 1. Purpose

G-CHAM DAG Canvas is a Japanese-first educational and research-design web application that helps beginners express causal assumptions explicitly and examine their graphical consequences.

The app must not present a user-entered arrow as an empirically established causal relationship. It should consistently use wording such as:

> 「現在入力されている因果仮定を前提とすると…」

## 2. Conceptual basis

The initial conceptual scope follows the causal-inference framework emphasized in *Causal Inference: What If* (Hernán & Robins), especially:

- explicit causal questions and assumptions
- causal diagrams
- confounding and the backdoor criterion
- confounding adjustment
- selection bias
- measurement bias
- consistency
- exchangeability
- positivity
- standardization
- inverse probability weighting
- later extension to time-varying treatments and mediation

The application is an educational implementation. It must distinguish:
1. causal assumptions entered by the user,
2. graph-theoretic consequences of those assumptions,
3. empirical/statistical evidence.

## 3. Target users

Primary:
- public health nurses
- nursing and public-health students
- epidemiology beginners
- health researchers beginning causal inference

Secondary:
- graduate students
- educators
- applied researchers

## 4. MVP screen

Desktop: three-column layout.

### Left: Research question
- project title
- PICO
- PECO
- HAPECOM
- research-question memo
- send Exposure and Outcome to DAG

### Center: DAG Canvas
- add/delete variable
- drag nodes
- draw/delete arrows
- exposure/outcome designation
- adjustment designation
- automatic layout later
- zoom, pan, fit view

### Right: Causal diagnostics
- DAG validity / directed-cycle warning
- directed causal path
- candidate/active backdoor paths
- current adjustment status
- minimal sufficient adjustment sets
- collider warning
- mediator warning
- unmeasured-variable warning
- explanation of why a warning appears

## 5. Variable metadata

Each variable stores:

- id
- Japanese label
- optional English label
- role
  - exposure
  - outcome
  - covariate
  - unmeasured
  - selection
- measurement status
  - measured
  - planned
  - unmeasured
  - unavailable
- time point
- note

Structural roles such as confounder, mediator, and collider should principally be derived relative to the selected Exposure and Outcome rather than permanently assigned as intrinsic properties.

## 6. Graph analysis

### MVP
- enforce or warn about directed cycles
- enumerate directed paths Exposure → Outcome
- enumerate backdoor paths that enter Exposure
- determine whether paths are active given the current adjustment set
- identify path colliders
- account for conditioned descendants of colliders
- suggest graph-theoretic minimal adjustment sets for small DAGs
- exclude Exposure, Outcome, and descendants of Exposure from total-effect adjustment candidates

### Wording
Never say:
- 「この変数は真の交絡因子です」

Prefer:
- 「現在のDAGでは、この変数を含む調整セットがバックドアパスを遮断します」

## 7. Adjustment visualization

Adjustment must not rewrite the original causal assumptions.

Display layers:
- original DAG
- adjustment view
- intervention view (future)

Adjusted nodes are marked visually. Blocked paths become subdued; newly opened collider paths are highlighted as warnings.

## 8. Persistence

No backend in MVP.

Required:
- automatic save to localStorage
- restore on browser reopen
- JSON export
- JSON import
- schema version

Later:
- compact project code
- URL sharing when payload size permits
- IndexedDB for larger projects

## 9. Export

MVP:
- project JSON

Next:
- SVG
- PNG
- DAGitty-compatible text if licensing/compatibility strategy is finalized
- publication-ready figure mode

## 10. Beginner mode

Required:
- Japanese-first labels
- concise explanations
- 「なぜ？」 explanations
- color legend
- example project
- warnings written as consequences of assumptions, not facts

## 11. Advanced mode

Later:
- d-separation inspection
- intervention graph / do(X)
- selection diagrams
- instrumental variables
- direct vs total effect
- standardization
- IP weighting
- target-trial support
- time-varying treatment
- causal mediation

## 12. Technical architecture

MVP:
- React
- TypeScript
- Vite
- @xyflow/react
- static GitHub Pages deployment
- localStorage

No API keys, accounts, database, or paid infrastructure are required.

## 13. Licensing strategy

The first implementation uses an independent graph-analysis module written in this repository. Third-party causal-analysis code must not be copied into the project until license compatibility has been explicitly reviewed.

## 14. Acceptance criteria for MVP

A user can:
1. structure a question using PICO, PECO, or HAPECOM;
2. create variables;
3. connect variables with directed arrows;
4. select Exposure and Outcome;
5. mark variables for adjustment;
6. see active backdoor paths update;
7. see a warning if collider conditioning opens a path;
8. see candidate minimal adjustment sets;
9. close the browser and restore the project;
10. export and import the project as JSON.
