// Shared domain types for the CCM-LMI app.

/** A state variable: its name, the box [min, max] it ranges over, and its
 *  initial condition for simulation. */
export interface Signal {
  name: string;
  min: number;
  max: number;
  ic: number;
}

/** A single matrix entry, held as a math.js expression string (e.g. "eta*cos(theta)"). */
export interface MatrixElement {
  expression: string;
}

/** A Jacobian entry, also an expression string (a symbolic partial derivative). */
export interface JacobianElement {
  expression: string;
}

/** Result of sweeping the Jacobian's eigenvalues over the state-space grid. */
export interface EigenvalueAnalysis {
  minRealEig: number;
  maxRealEig: number;
  minImagEig: number;
  maxImagEig: number;
  gridPoints: number;
}

/** Result of the CCM-LMI optimization (camelCase view used by the UI). */
export interface LMIAnalysis {
  minEigH: number | null;
  maxEigH: number | null;
  minEigD: number | null;
  maxEigD: number | null;
  feasible: boolean;
  W: number[][];
  M: number[][];
  rho: number;
  minEigW: number;
  maxEigW: number;
  minEigM: number;
  maxEigM: number;
  solverInfo: {
    solverName: string;
    setupTime: number | null;
    solveTime: number | null;
    status: string;
    optimalValue: number | null;
  };
  constraintsViolation: {
    H_negative_definite: boolean | null;
    D_positive_semidefinite: boolean | null;
    W_positive_definite: boolean;
    W_lower_bound: boolean;
    W_upper_bound: boolean;
    rho_positive: boolean;
  } | null;
}

/** A predefined example system. */
export interface SystemConfig {
  name: string;
  n: number;
  m: number;
  states: Signal[];
  matrixA: MatrixElement[][];
  matrixB: MatrixElement[][];
  lmiParams: {
    lambda: number;
    alphaMin: number;
    alphaMax: number;
  };
  matrixQ: number[];
}

/** One sample of a simulated trajectory. */
export interface SimulationPoint {
  t: number;
  states: number[];
  u: number;
}

export interface SimulationData {
  points: SimulationPoint[];
  isRunning: boolean;
}
