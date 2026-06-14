// System dynamics: symbolic Jacobian, expression evaluation, the CCM control
// law, and RK4 simulation. All functions here are pure (no React, no state).

import * as math from 'mathjs';
import type { JacobianElement, MatrixElement, SimulationPoint, Signal } from '../types';

/** Closed-loop control gain data from a feasible CCM-LMI solution. */
export interface ControlGains {
  W: number[][];
  rho: number;
}

/** Symbolic partial derivative d(expression)/d(variable) as a simplified string. */
export function getDerivative(expression: string, variable: string): string {
  if (!expression || expression.trim() === '' || expression === '0') return '0';
  if (!variable || variable.trim() === '') return '0';
  try {
    const node = math.parse(expression);
    if (!node) return '0';
    const derivative = math.derivative(node, variable);
    if (!derivative) return '0';
    return math.simplify(derivative).toString();
  } catch (error) {
    console.error('Error calculating derivative:', error);
    return '0';
  }
}

/** Symbolic Jacobian A = ∂f/∂x of the column f (matrixA) w.r.t. the state names. */
export function computeJacobian(
  fExpressions: MatrixElement[][],
  stateNames: string[],
  n: number,
): JacobianElement[][] {
  const jacobian: JacobianElement[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => ({ expression: '0' })),
  );
  for (let i = 0; i < n; i++) {
    const fExpr = fExpressions[i]?.[0]?.expression.trim();
    if (!fExpr) continue;
    for (let j = 0; j < n; j++) {
      const stateName = (stateNames[j] || `x${j + 1}`).trim();
      if (!stateName) continue;
      jacobian[i][j] = { expression: getDerivative(fExpr, stateName) };
    }
  }
  return jacobian;
}

/** Map a state vector to a { name: value } object for expression evaluation. */
export function stateToObject(state: number[], states: Signal[]): Record<string, number> {
  const obj: Record<string, number> = {};
  states.forEach((s, i) => {
    obj[s.name || `x${i + 1}`] = state[i];
  });
  return obj;
}

/** Evaluate a column of expressions (f or B) at a state point; failures → 0. */
export function evaluateColumn(
  column: MatrixElement[][],
  stateValues: Record<string, number>,
): number[] {
  return column.map((row) => {
    try {
      return Number(math.evaluate(row[0].expression, stateValues));
    } catch (error) {
      console.error('Error evaluating expression:', row[0].expression, error);
      return 0;
    }
  });
}

/** Evaluate the symbolic Jacobian numerically at a state point. */
export function evaluateJacobianAtPoint(
  jacobian: JacobianElement[][],
  stateValues: Record<string, number>,
  n: number,
): number[][] {
  const result = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const derivative = jacobian[i][j].expression;
      try {
        result[i][j] = derivative === '0' ? 0 : Number(math.evaluate(derivative, stateValues));
      } catch {
        console.error('Error evaluating derivative:', derivative, 'at point:', stateValues);
        result[i][j] = 0;
      }
    }
  }
  return result;
}

/** CCM tracking control u = -0.5 ρ Bᵀ W⁻¹ (x - x*), where x* is the target
 *  equilibrium (origin for the cart-pole, [π, 0] for the inverted pendulum). */
export function controlInput(
  state: number[],
  states: Signal[],
  matrixB: MatrixElement[][],
  W: number[][],
  rho: number,
): number {
  if (!W || !rho) return 0;
  try {
    const stateObj = stateToObject(state, states);
    const B = evaluateColumn(matrixB, stateObj);

    // Error relative to the target equilibrium.
    const isCartPole = states.length === 4 && states[2]?.name === 'p';
    const errorState = [...state];
    if (!isCartPole) {
      errorState[0] = state[0] - Math.PI; // inverted pendulum: theta - π
    }

    const Winv = math.inv(math.matrix(W));
    const WinvError = math.multiply(Winv, math.matrix(errorState));
    const Bt = math.transpose(math.matrix(B));
    const btWinvError = Number(math.multiply(Bt, WinvError)); // scalar dot product
    return Number(-0.5 * rho * btWinvError);
  } catch (error) {
    console.error('Error calculating control input:', error);
    return 0;
  }
}

/** ẋ = f(x) [+ B(x) u(x) when closed-loop control gains are supplied]. */
export function stateDerivative(
  state: number[],
  fExpressions: MatrixElement[][],
  states: Signal[],
  matrixB: MatrixElement[][],
  control: ControlGains | null,
): number[] {
  const stateObj = stateToObject(state, states);
  const openLoop = evaluateColumn(fExpressions, stateObj);
  if (!control) return openLoop;

  const u = controlInput(state, states, matrixB, control.W, control.rho);
  const B = evaluateColumn(matrixB, stateObj);
  return openLoop.map((f, i) => f + B[i] * u);
}

/** One classic RK4 integration step of the (autonomous) dynamics. */
export function rk4Step(
  state: number[],
  dt: number,
  fExpressions: MatrixElement[][],
  states: Signal[],
  matrixB: MatrixElement[][],
  control: ControlGains | null,
): number[] {
  const k1 = stateDerivative(state, fExpressions, states, matrixB, control);
  const k2 = stateDerivative(state.map((x, i) => x + (k1[i] * dt) / 2), fExpressions, states, matrixB, control);
  const k3 = stateDerivative(state.map((x, i) => x + (k2[i] * dt) / 2), fExpressions, states, matrixB, control);
  const k4 = stateDerivative(state.map((x, i) => x + k3[i] * dt), fExpressions, states, matrixB, control);
  return state.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export interface SimulateParams {
  states: Signal[];
  fExpressions: MatrixElement[][];
  matrixB: MatrixElement[][];
  duration: number;
  sampleTime: number;
  /** null = open-loop; otherwise apply the CCM control law each step. */
  control: ControlGains | null;
}

/** Integrate the trajectory from the states' initial conditions. Throws if the
 *  trajectory diverges (NaN/Inf). */
export function simulate({ states, fExpressions, matrixB, duration, sampleTime, control }: SimulateParams): SimulationPoint[] {
  const dt = sampleTime;
  const numSteps = Math.floor(duration / dt);

  let current = states.map((s) => s.ic);
  const u0 = control ? controlInput(current, states, matrixB, control.W, control.rho) : 0;
  const points: SimulationPoint[] = [{ t: 0, states: [...current], u: u0 }];

  for (let step = 1; step <= numSteps; step++) {
    current = rk4Step(current, dt, fExpressions, states, matrixB, control);
    if (current.some((x) => isNaN(x) || !isFinite(x))) {
      throw new Error('Simulation produced invalid values. The system might be unstable.');
    }
    const u = control ? controlInput(current, states, matrixB, control.W, control.rho) : 0;
    points.push({ t: step * dt, states: [...current], u });
  }
  return points;
}
