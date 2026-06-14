// Thin async wrapper around the pure-TypeScript SDP solver, exposing the same
// interface the app used for the old backend call (solveLMI / isReady), so the
// solve happens locally and instantly with no network or WebAssembly.

import { solveCCM, type CCMPayload, type CCMResult } from './sdpSolver';

// The app also sends `state_values` (used only for evaluating A/B on the JS
// side, already done before this call); the solver itself ignores it.
export type LMIPayload = CCMPayload & { state_values?: Record<string, number> };

// Always ready — there is nothing to download or boot.
export function isReady(): boolean {
  return true;
}

export async function solveLMI<T = CCMResult>(payload: LMIPayload): Promise<T> {
  // Yield once so React can paint a "solving" state before a heavier n=4 solve.
  await Promise.resolve();
  return solveCCM(payload) as T;
}
