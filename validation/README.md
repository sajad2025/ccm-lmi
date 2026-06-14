# Solver validation

A regression guard for the pure-TypeScript CCM-LMI solver in
[`../src/solver/sdpSolver.ts`](../src/solver/sdpSolver.ts), which replaced the
former Python/cvxpy backend. It checks the JS solver against reference results
computed by cvxpy + Clarabel.

## Run the check (no Python needed)

```bash
npm run validate:solver
```

This runs [`validateSolver.ts`](validateSolver.ts) against the committed
[`ground_truth.json`](ground_truth.json) and asserts that, across all cases
(pendulum, cart-pole, and randomized n=1–4 systems, both the H and D
constraints), every feasibility verdict matches and every feasible ρ agrees with
cvxpy to within a 2×10⁻³ relative tolerance. Exit code is non-zero on any
mismatch.

Requires Node ≥ 22.6 (uses native TypeScript execution via type stripping).

## Regenerate the reference (needs cvxpy)

`ground_truth.json` is committed, so the check above needs no Python. Only
regenerate it if you change the problem formulation:

```bash
python3 -m venv /tmp/ccm-gt && . /tmp/ccm-gt/bin/activate
pip install cvxpy clarabel numpy
python validation/genGroundTruth.py
```

[`genGroundTruth.py`](genGroundTruth.py) is a self-contained cvxpy oracle (the
same LMI model and CLARABEL tolerances the backend used). The case sweep is
seeded, so regeneration is reproducible.
