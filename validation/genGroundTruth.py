"""Regenerate validation/ground_truth.json — the cvxpy/Clarabel reference that
the pure-JS solver (src/solver/sdpSolver.ts) is validated against.

This is a DEV-ONLY tool. The app has no Python dependency; the generated
ground_truth.json is committed so `npm run validate:solver` runs with no Python.
You only need this script to refresh the reference (e.g. after changing the
problem formulation).

Usage:
    python3 -m venv /tmp/ccm-gt && . /tmp/ccm-gt/bin/activate
    pip install cvxpy clarabel numpy
    python validation/genGroundTruth.py

It reproduces the exact CCM-LMI optimization the original FastAPI backend solved
(minimize rho s.t. the H or D LMI plus the alpha-box bounds), using CLARABEL with
the same 1e-8 tolerances.
"""

import json
import os

import numpy as np
import cvxpy as cp

EPS = 1e-8


def solve_lmi(A, B, Q, alpha_min, alpha_max, n, lambda_val, use_d_constraint):
    """Returns (feasible, rho) for the CCM-LMI program — faithful to the
    original backend (backend/lmi_solver.py)."""
    W = cp.Variable((n, n), symmetric=True)
    rho = cp.Variable()
    I_n = np.eye(n)

    try:
        L = np.linalg.cholesky(Q).T
    except np.linalg.LinAlgError:
        L = np.diag(np.sqrt(np.diag(Q)))

    BB_T = B @ B.T
    constraints = [W >> alpha_min * I_n, W << alpha_max * I_n, rho >= 0]

    if use_d_constraint:
        D11 = -W @ A.T - A @ W + rho * BB_T
        D12 = W @ L.T
        D21 = L @ W
        D = cp.bmat([[D11, D12], [D21, I_n]])
        constraints.append(D >> -EPS * np.eye(2 * n))
    else:
        H = A @ W + W @ A.T - rho * BB_T + 2 * lambda_val * W
        constraints.append(H << -EPS * I_n)

    prob = cp.Problem(cp.Minimize(rho), constraints)
    use_clarabel = cp.CLARABEL in cp.installed_solvers()
    opts = {"tol_gap_abs": 1e-8, "tol_gap_rel": 1e-8} if use_clarabel else {}
    try:
        if use_clarabel:
            prob.solve(solver=cp.CLARABEL, **opts)
        else:
            prob.solve()
    except Exception:
        return False, 0.0

    if prob.status in ("optimal", "optimal_inaccurate"):
        return True, float(rho.value)
    return False, 0.0


cases = []


def add(name, A, B, q, amin, amax, lam, n, useD):
    A = np.asarray(A, float)
    B = np.asarray(B, float)
    Q = np.diag([float(x) for x in q])
    feasible, rho = solve_lmi(A, B, Q, amin, amax, n, lam, useD)
    cases.append({
        "name": name,
        "payload": {
            "matrix_a": A.tolist(), "matrix_b": B.tolist(),
            "matrix_q": [float(x) for x in q],
            "alpha_min": float(amin), "alpha_max": float(amax),
            "lambda_val": float(lam), "n": int(n), "use_d_constraint": bool(useD),
        },
        "expected": {"feasible": feasible, "rho": rho},
    })


def main():
    rng = np.random.default_rng(0)

    # real pendulum, H constraint, theta sweep
    for th in [2.9, 3.0, 3.1, 3.2, 3.3]:
        add(f"pend_H_th{th}", [[0, 1], [-10 * np.cos(th), -0.1]], [[0], [1]], [0, 0], 0.1, 5.0, 1.0, 2, False)
    # pendulum lambda sweep
    for lam in [0.5, 2.0, 5.0]:
        add(f"pend_H_lam{lam}", [[0, 1], [-10 * np.cos(3.1), -0.1]], [[0], [1]], [0, 0], 0.1, 5.0, lam, 2, False)

    # real cart-pole, D constraint + lambda variants, and the H toggle
    Acp = [[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, 0]]
    Bcp = [[0], [-1], [0], [1]]
    for lam in [0.05, 0.1, 0.2]:
        add(f"cartpole_D_lam{lam}", Acp, Bcp, [1, 1, 10, 1], 0.005, 5.0, lam, 4, True)
    add("cartpole_H", Acp, Bcp, [1, 1, 10, 1], 0.005, 5.0, 0.1, 4, False)

    # scalar / empty edge cases (expected infeasible / trivial)
    add("empty_n1", [[0]], [[0]], [0], 0.01, 5.0, 0.5, 1, False)
    add("scalar_stable", [[-1.0]], [[1.0]], [1.0], 0.01, 5.0, 0.5, 1, False)
    add("scalar_unstable", [[2.0]], [[1.0]], [1.0], 0.01, 5.0, 0.5, 1, False)

    # randomized systems, both constraints, n = 2,3,4 (seeded for reproducibility)
    idx = 0
    for n in [2, 3, 4]:
        for useD in [False, True]:
            for _ in range(6 if not useD else 4):
                A = rng.uniform(-2, 2, size=(n, n))
                B = rng.integers(0, 2, size=(n, 1)).astype(float)
                if B.sum() == 0:
                    B[rng.integers(0, n)] = 1.0
                q = list(rng.uniform(0.5, 3.0, size=n))
                lam = float(rng.choice([0.1, 0.5, 1.0]))
                add(f"rand_n{n}_{'D' if useD else 'H'}_{idx}", A.tolist(), B.tolist(), q, 0.01, 5.0, lam, n, useD)
                idx += 1

    out_path = os.path.join(os.path.dirname(__file__), "ground_truth.json")
    with open(out_path, "w") as f:
        json.dump({"cases": cases}, f, indent=1)

    feas = sum(1 for c in cases if c["expected"]["feasible"])
    print(f"wrote {out_path}: {len(cases)} cases ({feas} feasible, {len(cases) - feas} infeasible)")


if __name__ == "__main__":
    main()
