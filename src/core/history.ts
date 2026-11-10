import { clone, LIMITS, type HistoryState, type SceneDocument } from "./types";

export type HistoryAction =
  | { type: "commit"; scene: SceneDocument }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; scene: SceneDocument };
export const initialHistory = (scene: SceneDocument): HistoryState => ({
  present: clone(scene),
  past: [],
  future: [],
});
export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  if (action.type === "reset") return initialHistory(action.scene);
  if (action.type === "commit")
    return {
      past: [...state.past, state.present].slice(-LIMITS.history),
      present: { ...clone(action.scene), revision: state.present.revision + 1 },
      future: [],
    };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: { ...clone(previous), revision: state.present.revision + 1 },
      future: [state.present, ...state.future].slice(0, LIMITS.history),
    };
  }
  const next = state.future[0];
  if (!next) return state;
  return {
    past: [...state.past, state.present].slice(-LIMITS.history),
    present: { ...clone(next), revision: state.present.revision + 1 },
    future: state.future.slice(1),
  };
}
