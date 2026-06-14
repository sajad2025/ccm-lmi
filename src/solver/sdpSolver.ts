// Pure-TypeScript solver for the CCM-LMI semidefinite program — no backend,
// no WebAssembly. Replaces the former Python/cvxpy backend.
//
// Problem (minimize rho over symmetric W and scalar rho >= 0):
//   H variant:  H = A W + W Aᵀ - rho BBᵀ + 2λW  ⪯ -εI
//   D variant:  D = [[-WAᵀ-AW+rho BBᵀ, W Lᵀ], [L W, I]]  ⪰ -εI   (L Lᵀ = Q)
//   box:        αmin I ⪯ W ⪯ αmax I
//
// Method: bisection on rho (the feasible-rho set is a half-line [rho*, ∞),
// because increasing rho only adds rho·BBᵀ ⪰ 0 to the relevant block and so can
// only relax the constraints). At each fixed rho we solve a *max-margin*
// feasibility SDP — maximize t s.t. Gₖ(W) ⪰ tI — with a log-det barrier /
// Newton interior-point method. That auxiliary problem is always strictly
// feasible for sufficiently negative t, so no Phase-I is needed, and the sign
// of the optimal margin t* decides feasibility at that rho.
//
// All matrices are plain number[][]; dimensions are tiny (W is n×n with n ≤ 4,
// the D-block is ≤ 8×8), so dense linear algebra is more than fast enough.

const EPS = 1e-8; // matches the backend's strict-inequality margin

type Mat = number[][];

// ---------------------------------------------------------------------------
// dense matrix helpers
// ---------------------------------------------------------------------------
function zeros(r: number, c: number): Mat {
  return Array.from({ length: r }, () => new Array<number>(c).fill(0));
}
function eye(n: number): Mat {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}
function clone(a: Mat): Mat {
  return a.map((row) => row.slice());
}
function transpose(a: Mat): Mat {
  const r = a.length, c = a[0].length, out = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = a[i][j];
  return out;
}
function matmul(a: Mat, b: Mat): Mat {
  const r = a.length, k = b.length, c = b[0].length, out = zeros(r, c);
  for (let i = 0; i < r; i++) {
    for (let p = 0; p < k; p++) {
      const aip = a[i][p];
      if (aip === 0) continue;
      const bp = b[p];
      const oi = out[i];
      for (let j = 0; j < c; j++) oi[j] += aip * bp[j];
    }
  }
  return out;
}
function add(a: Mat, b: Mat): Mat {
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}
function sub(a: Mat, b: Mat): Mat {
  return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}
function scale(a: Mat, s: number): Mat {
  return a.map((row) => row.map((v) => v * s));
}
function symmetrize(a: Mat): Mat {
  const n = a.length, out = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] = 0.5 * (a[i][j] + a[j][i]);
  return out;
}
// trace(A·B) without forming the product
function traceProd(a: Mat, b: Mat): number {
  let t = 0;
  const n = a.length, m = a[0].length;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) t += a[i][j] * b[j][i];
  return t;
}

// ---------------------------------------------------------------------------
// Cholesky-based routines (matrices here are symmetric; PD where required)
// ---------------------------------------------------------------------------
// Returns lower-triangular L with L Lᵀ = M, or null if M is not positive
// definite (also our PD test).
function cholesky(M: Mat): Mat | null {
  const n = M.length;
  const L = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-14) return null; // not PD
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  return L;
}
function logdetFromChol(L: Mat): number {
  let s = 0;
  for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
  return 2 * s;
}
// Inverse of an SPD matrix given its Cholesky factor.
function invFromChol(L: Mat): Mat {
  const n = L.length;
  const inv = zeros(n, n);
  // Solve L Lᵀ X = I column by column.
  for (let col = 0; col < n; col++) {
    const y = new Array<number>(n).fill(0);
    // forward: L y = e_col
    for (let i = 0; i < n; i++) {
      let s = i === col ? 1 : 0;
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    // backward: Lᵀ x = y
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * inv[k][col];
      inv[i][col] = s / L[i][i];
    }
  }
  return inv;
}
// Solve SPD system Hess·x = b (used for the Newton step).
function solveSPD(H: Mat, b: number[]): number[] | null {
  const L = cholesky(H);
  if (!L) return null;
  const n = H.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

// ---------------------------------------------------------------------------
// Symmetric eigenvalues via cyclic Jacobi (for reporting min/max eigenvalues,
// matching the backend's eigenvalue ranges). Robust for the small dims here.
// ---------------------------------------------------------------------------
function eigSym(Min: Mat): number[] {
  const n = Min.length;
  const a = clone(Min);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < n; i++) {
          const aip = a[i][p], aiq = a[i][q];
          a[i][p] = c * aip - s * aiq;
          a[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = a[p][i], aqi = a[q][i];
          a[p][i] = c * api - s * aqi;
          a[q][i] = s * api + c * aqi;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i][i]).sort((x, y) => x - y);
}

// ---------------------------------------------------------------------------
// Affine matrix constraint:  Gₖ(W) = base + Σᵥ Wᵥ · gcoef[v]  (Wᵥ are the
// upper-triangle entries of W). In the margin problem we use Hₖ = Gₖ(W) - tI.
// ---------------------------------------------------------------------------
interface Constraint {
  dim: number;
  base: Mat;       // value at W = 0
  gcoef: Mat[];    // ∂Gₖ/∂Wᵥ for each W variable
}

// upper-triangle (r,c) index list for a symmetric n×n W
function triIndices(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < n; r++) for (let c = r; c < n; c++) out.push([r, c]);
  return out;
}
// symmetric unit basis matrix for variable (r,c)
function unitSym(n: number, r: number, c: number): Mat {
  const E = zeros(n, n);
  E[r][c] = 1;
  E[c][r] = 1;
  return E;
}

interface BuiltProblem {
  n: number;
  nW: number;          // number of W variables
  tri: Array<[number, number]>;
  buildConstraints: (rho: number) => Constraint[];
}

function buildProblem(
  A: Mat, B: Mat, L: Mat, alphaMin: number, alphaMax: number,
  lambda: number, n: number, useD: boolean,
): BuiltProblem {
  const tri = triIndices(n);
  const nW = tri.length;
  const E = tri.map(([r, c]) => unitSym(n, r, c));
  const At = transpose(A);
  const Lt = transpose(L);
  const BBt = matmul(B, transpose(B));

  // place an n×n block into a 2n×2n matrix at (br,bc) block position
  const place2n = (block: Mat, br: number, bc: number): Mat => {
    const out = zeros(2 * n, 2 * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[br * n + i][bc * n + j] = block[i][j];
    return out;
  };

  const buildConstraints = (rho: number): Constraint[] => {
    const cons: Constraint[] = [];

    // C1: W - αmin I ⪰ 0
    cons.push({ dim: n, base: scale(eye(n), -alphaMin), gcoef: E.map((Ev) => clone(Ev)) });
    // C2: αmax I - W ⪰ 0
    cons.push({ dim: n, base: scale(eye(n), alphaMax), gcoef: E.map((Ev) => scale(Ev, -1)) });

    if (!useD) {
      // C3 (H): -(A W + W Aᵀ + 2λ W) + rho BBᵀ - εI ⪰ 0
      const base = sub(scale(BBt, rho), scale(eye(n), EPS));
      const gcoef = E.map((Ev) =>
        scale(add(add(matmul(A, Ev), matmul(Ev, At)), scale(Ev, 2 * lambda)), -1),
      );
      cons.push({ dim: n, base, gcoef });
    } else {
      // C3 (D): D(W) + εI ⪰ 0, dim 2n
      // base (W=0): [[rho BBᵀ, 0],[0, I]] + εI
      let base = add(place2n(scale(BBt, rho), 0, 0), place2n(eye(n), 1, 1));
      base = add(base, scale(eye(2 * n), EPS));
      const gcoef = E.map((Ev) => {
        const tl = scale(add(matmul(Ev, At), matmul(A, Ev)), -1); // -WAᵀ-AW part
        const tr = matmul(Ev, Lt);                                // W Lᵀ
        const bl = matmul(L, Ev);                                 // L W
        let G = place2n(tl, 0, 0);
        G = add(G, place2n(tr, 0, 1));
        G = add(G, place2n(bl, 1, 0));
        return G;
      });
      cons.push({ dim: 2 * n, base, gcoef });
    }
    return cons;
  };

  return { n, nW, tri, buildConstraints };
}

// Evaluate Hₖ = Gₖ(W) - tI for the current variables x = [W vars..., t]
function evalH(cons: Constraint[], x: number[], nW: number): Mat[] {
  const t = x[nW];
  return cons.map((con) => {
    const H = clone(con.base);
    for (let v = 0; v < nW; v++) {
      const xv = x[v];
      if (xv === 0) continue;
      const g = con.gcoef[v];
      for (let i = 0; i < con.dim; i++) for (let j = 0; j < con.dim; j++) H[i][j] += xv * g[i][j];
    }
    for (let i = 0; i < con.dim; i++) H[i][i] -= t; // -tI
    return H;
  });
}

interface MarginResult {
  t: number;       // optimal margin t*
  W: Mat;          // a feasible (margin-achieving) W
  ok: boolean;     // numerics stayed healthy
}

// Maximize t s.t. Gₖ(W) ⪰ tI  via a log-det barrier / Newton path-following.
function maxMargin(P: BuiltProblem, rho: number, alphaMin: number, alphaMax: number): MarginResult {
  const cons = P.buildConstraints(rho);
  const nW = P.nW;
  const nvar = nW + 1;
  const tIdx = nW;

  // start: W = c·I (strictly inside the box), t below all margins
  const c = Math.min(Math.max(Math.sqrt(alphaMin * alphaMax), alphaMin * 1.05), alphaMax * 0.95);
  const x = new Array<number>(nvar).fill(0);
  for (let i = 0; i < P.n; i++) {
    const idx = P.tri.findIndex(([r, cc]) => r === i && cc === i);
    x[idx] = c;
  }
  // margins of each Gₖ(W0): Hₖ at t=0
  x[tIdx] = 0;
  const H0 = evalH(cons, x, nW);
  let minMargin = Infinity;
  for (const Hk of H0) minMargin = Math.min(minMargin, eigSym(Hk)[0]);
  x[tIdx] = minMargin - 1.0; // strictly feasible: every Hₖ ≻ 0

  // total barrier dimension (for the duality-gap stopping rule)
  const mBar = cons.reduce((s, con) => s + con.dim, 0);

  let s = 1.0;
  const MU = 10, S_MAX = 1e12;
  // `started` just records that we evaluated ≥1 valid iterate (always true given
  // the strictly-feasible start). We do NOT treat convergence-time numerical
  // events (binding constraint → singular Hₖ/Hessian at the optimum) as failure:
  // x stays at the last PD-accepted iterate, whose margin x[tIdx] is the answer.
  let started = false;
  let done = false;

  for (let outer = 0; outer < 80 && !done; outer++) {
    // centering: Newton minimize φ_s(x) = -s·t - Σ logdet Hₖ
    for (let nstep = 0; nstep < 50; nstep++) {
      const H = evalH(cons, x, nW);
      const chols = H.map(cholesky);
      if (chols.some((L) => L === null)) { done = true; break; } // reached boundary
      started = true;
      const Hinv = chols.map((L) => invFromChol(L!));

      // P_{k,i} = Hₖ⁻¹ · coeff_{k,i}
      const grad = new Array<number>(nvar).fill(0);
      const Hess = zeros(nvar, nvar);
      const Pmats: Mat[][] = cons.map(() => new Array<Mat>(nvar));
      for (let k = 0; k < cons.length; k++) {
        const con = cons[k];
        for (let i = 0; i < nvar; i++) {
          const coeff = i === tIdx ? scale(eye(con.dim), -1) : con.gcoef[i];
          Pmats[k][i] = matmul(Hinv[k], coeff);
        }
      }
      for (let i = 0; i < nvar; i++) {
        let gi = i === tIdx ? -s : 0;
        for (let k = 0; k < cons.length; k++) {
          // trace(P_{k,i}) = trace(Hₖ⁻¹ coeff)
          let tr = 0;
          const Pk = Pmats[k][i];
          for (let d = 0; d < cons[k].dim; d++) tr += Pk[d][d];
          gi -= tr;
        }
        grad[i] = gi;
        for (let j = i; j < nvar; j++) {
          let h = 0;
          for (let k = 0; k < cons.length; k++) h += traceProd(Pmats[k][i], Pmats[k][j]);
          Hess[i][j] = h;
          Hess[j][i] = h;
        }
      }
      // adaptive ridge: scale with the Hessian magnitude (it blows up near the
      // boundary) so the Newton system stays solvable as long as possible.
      let maxDiag = 0;
      for (let i = 0; i < nvar; i++) maxDiag = Math.max(maxDiag, Math.abs(Hess[i][i]));
      const ridge = 1e-11 * (1 + maxDiag);
      for (let i = 0; i < nvar; i++) Hess[i][i] += ridge;

      const negGrad = grad.map((g) => -g);
      const dx = solveSPD(Hess, negGrad);
      if (!dx) { done = true; break; } // Hessian singular ⇒ effectively converged

      // Newton decrement
      let lam2 = 0;
      for (let i = 0; i < nvar; i++) lam2 += -grad[i] * dx[i];
      if (lam2 / 2 < 1e-12) break;

      // backtracking line search keeping every Hₖ ≻ 0 and φ decreasing
      const phi = (xx: number[]): number => {
        const Hx = evalH(cons, xx, nW);
        let v = -s * xx[tIdx];
        for (const Hk of Hx) {
          const L = cholesky(Hk);
          if (!L) return Infinity;
          v -= logdetFromChol(L);
        }
        return v;
      };
      const phi0 = phi(x);
      let alpha = 1.0;
      const gdotdx = grad.reduce((acc, g, i) => acc + g * dx[i], 0);
      let stepped = false;
      for (let ls = 0; ls < 40; ls++) {
        const xn = x.map((xi, i) => xi + alpha * dx[i]);
        if (phi(xn) <= phi0 + 0.25 * alpha * gdotdx) {
          for (let i = 0; i < nvar; i++) x[i] = xn[i];
          stepped = true;
          break;
        }
        alpha *= 0.5;
      }
      if (!stepped) break; // can't improve; treat as centered
    }
    if (mBar / s < 1e-10) break;
    s *= MU;
    if (s > S_MAX) break;
  }

  // recover W from x (x is always the last PD-accepted iterate)
  const W = zeros(P.n, P.n);
  P.tri.forEach(([r, cc], v) => { W[r][cc] = x[v]; W[cc][r] = x[v]; });
  return { t: x[tIdx], W, ok: started };
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
export interface CCMPayload {
  matrix_a: number[][];
  matrix_b: number[][];
  matrix_q: number[];
  alpha_min: number;
  alpha_max: number;
  lambda_val: number;
  n: number;
  use_d_constraint: boolean;
}

export interface CCMResult {
  feasible: boolean;
  W: number[][] | null;
  M: number[][] | null;
  rho: number;
  min_eig_h: number | null;
  max_eig_h: number | null;
  min_eig_d: number | null;
  max_eig_d: number | null;
  min_eig_w: number;
  max_eig_w: number;
  min_eig_m: number;
  max_eig_m: number;
  solver_info: {
    solver_name?: string;
    status: string;
    optimal_value?: number | null;
    setup_time?: number | null;
    solve_time?: number | null;
  };
  constraints_violation: {
    H_negative_definite: boolean | null;
    D_positive_semidefinite: boolean | null;
    W_positive_definite: boolean;
    W_lower_bound: boolean;
    W_upper_bound: boolean;
    rho_positive: boolean;
  } | null;
}

function infeasibleResult(status: string): CCMResult {
  return {
    feasible: false, W: null, M: null, rho: 0,
    min_eig_h: null, max_eig_h: null, min_eig_d: null, max_eig_d: null,
    min_eig_w: 0, max_eig_w: 0, min_eig_m: 0, max_eig_m: 0,
    solver_info: { solver_name: 'CCM-JS-IPM', status, optimal_value: null },
    constraints_violation: null,
  };
}

// Cholesky-style upper factor L with L Lᵀ = Q (Q diagonal here); falls back to
// sqrt(diag) when Q is not PD — mirroring the backend.
function choleskyUpperOfDiag(qDiag: number[]): Mat {
  const n = qDiag.length;
  const L = zeros(n, n);
  let pd = true;
  for (const q of qDiag) if (q <= 0) pd = false;
  for (let i = 0; i < n; i++) L[i][i] = Math.sqrt(Math.max(qDiag[i], 0));
  // For a diagonal Q the upper Cholesky factor is just diag(sqrt(q)); the
  // backend transposes chol(Q) but for diagonal Q that is identical.
  void pd;
  return L;
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export function solveCCM(payload: CCMPayload): CCMResult {
  const t0 = nowMs();
  try {
    const n = payload.n | 0;
    const A = payload.matrix_a.map((r) => r.slice());
    const B = payload.matrix_b.map((r) => r.slice());
    const L = choleskyUpperOfDiag(payload.matrix_q);
    const { alpha_min: alphaMin, alpha_max: alphaMax, lambda_val: lambda, use_d_constraint: useD } = payload;

    const P = buildProblem(A, B, L, alphaMin, alphaMax, lambda, n, useD);
    const setupTime = (nowMs() - t0) / 1000;

    const feasibleAt = (rho: number): MarginResult => maxMargin(P, rho, alphaMin, alphaMax);
    const T_FEAS = -1e-7; // margin threshold counted as feasible

    // bracket the minimal feasible rho
    let rhoStar: number;
    const r0 = feasibleAt(0);
    if (r0.ok && r0.t >= T_FEAS) {
      rhoStar = 0;
    } else {
      let hi = 1.0;
      let hiRes = feasibleAt(hi);
      const RHO_CAP = 1e7;
      while ((!hiRes.ok || hiRes.t < T_FEAS) && hi < RHO_CAP) {
        hi *= 4;
        hiRes = feasibleAt(hi);
      }
      if (!hiRes.ok || hiRes.t < T_FEAS) {
        return infeasibleResult('infeasible');
      }
      // bisection on [lo, hi], lo infeasible (0), hi feasible
      let lo = 0;
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        const res = feasibleAt(mid);
        if (res.ok && res.t >= T_FEAS) hi = mid; else lo = mid;
        if (hi - lo < 1e-9 * Math.max(1, hi)) break;
      }
      rhoStar = hi;
    }

    // final solve at rho* to recover W
    const finalRes = feasibleAt(rhoStar);
    if (!finalRes.ok) return infeasibleResult('failed');
    const Wsym = symmetrize(finalRes.W);

    // M = W⁻¹
    const Lw = cholesky(Wsym);
    if (!Lw) return infeasibleResult('failed');
    const M = invFromChol(Lw);

    // report eigenvalues / constraint checks exactly like the backend
    const BBt = matmul(B, transpose(B));
    const At = transpose(A);
    const eigW = eigSym(Wsym);
    const eigM = eigSym(symmetrize(M));
    const minEigW = eigW[0], maxEigW = eigW[eigW.length - 1];
    const minEigM = eigM[0], maxEigM = eigM[eigM.length - 1];

    let minEigH: number | null = null, maxEigH: number | null = null;
    let minEigD: number | null = null, maxEigD: number | null = null;
    let hNegDef: boolean | null = null, dPosDef: boolean | null = null;
    const tol = 1e-6;

    if (!useD) {
      // H = A W + W Aᵀ - rho BBᵀ + 2λW
      let H = add(add(matmul(A, Wsym), matmul(Wsym, At)), scale(Wsym, 2 * lambda));
      H = sub(H, scale(BBt, rhoStar));
      const eigH = eigSym(symmetrize(H));
      minEigH = eigH[0]; maxEigH = eigH[eigH.length - 1];
      hNegDef = maxEigH <= tol;
    } else {
      // D = [[-WAᵀ-AW+rho BBᵀ, W Lᵀ],[L W, I]]
      const Lt = transpose(L);
      const d11 = add(sub(scale(matmul(Wsym, At), -1), matmul(A, Wsym)), scale(BBt, rhoStar));
      const d12 = matmul(Wsym, Lt);
      const d21 = matmul(L, Wsym);
      const D = zeros(2 * n, 2 * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        D[i][j] = d11[i][j];
        D[i][n + j] = d12[i][j];
        D[n + i][j] = d21[i][j];
        D[n + i][n + j] = i === j ? 1 : 0;
      }
      const eigD = eigSym(symmetrize(D));
      minEigD = eigD[0]; maxEigD = eigD[eigD.length - 1];
      dPosDef = minEigD >= -tol;
    }

    const solveTime = (nowMs() - t0) / 1000;
    return {
      feasible: true,
      W: Wsym, M,
      rho: rhoStar,
      min_eig_h: minEigH, max_eig_h: maxEigH,
      min_eig_d: minEigD, max_eig_d: maxEigD,
      min_eig_w: minEigW, max_eig_w: maxEigW,
      min_eig_m: minEigM, max_eig_m: maxEigM,
      solver_info: {
        solver_name: 'CCM-JS-IPM',
        status: 'optimal',
        optimal_value: rhoStar,
        setup_time: setupTime,
        solve_time: solveTime,
      },
      constraints_violation: {
        H_negative_definite: hNegDef,
        D_positive_semidefinite: dPosDef,
        W_positive_definite: minEigW >= -tol,
        W_lower_bound: minEigW >= alphaMin - tol,
        W_upper_bound: maxEigW <= alphaMax + tol,
        rho_positive: rhoStar >= -tol,
      },
    };
  } catch (e) {
    return infeasibleResult('error: ' + String(e));
  }
}
