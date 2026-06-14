# CCM-LMI

Design and analyze nonlinear feedback controllers using **Control Contraction Metrics (CCM)**, right in your browser — no installation, no backend.

**▶ Live app: [sajad2025.github.io/ccm-lmi](https://sajad2025.github.io/ccm-lmi/)**

---

## About

A Control Contraction Metric certifies that a nonlinear system can be made to *contract* — any two trajectories converge — which in turn guarantees stabilizability and trajectory tracking. The key result is that searching for such a metric is a **convex** problem: it reduces to a Linear Matrix Inequality (LMI) that can be solved efficiently.

This app lets you state a nonlinear control-affine system `ẋ = f(x) + B(x)u`, solve the CCM-LMI feasibility problem for it, and immediately simulate the resulting contraction-based controller — all interactively.

It builds on:

1. **Control Contraction Metrics: Convex and Intrinsic Criteria for Nonlinear Feedback Design** — Manchester & Slotine, *IEEE Transactions on Automatic Control*, 2017. [[paper]](https://arxiv.org/pdf/1503.03144)
2. **Unifying Robot Trajectory Tracking with Control Contraction Metrics** — Manchester, Tang & Slotine, *Robotics Research*, 2018. [[paper]](https://books.google.com/books?id=RRsuDwAAQBAJ&pg=PA403)

## Using the app

The interface has three panels, used left to right:

**1 — State Space.** Pick a built-in example (inverted pendulum, cart-pole) or define your own: set the number of states `n` and inputs `m`, name each state and give it a range and initial condition, and enter the dynamics `f(x)` and input matrix `B(x)` as expressions (e.g. `eta*cos(theta)`). The Jacobian `A = ∂f/∂x` is computed symbolically as you type.

**2 — Analysis.** Choose the contraction rate `λ`, the metric bounds `α_min`/`α_max`, the weighting `Q`, and the LMI form (`H ≺ 0` or `D ⪰ 0`). Press **Analyze** to solve the CCM-LMI. You get the optimal `ρ`, the contraction metric `M = W⁻¹`, eigenvalue ranges, and a per-constraint feasibility check.

**3 — Simulation.** Once a metric is found, run the system **open-loop** or **closed-loop** (with the synthesized CCM controller). You see the state trajectories, the control input, and a live animation of the mechanism.

> Tip: on a phone, open the live link and choose **Add to Home Screen** to install it as an offline app.

## Develop

```bash
npm install
npm run dev              # local dev server
npm run build            # production build
npm run validate:solver  # check the in-browser solver against reference results
```

The LMI is solved by a small interior-point solver written in TypeScript ([`src/solver`](src/solver)), so the app is fully static and works offline. The solver is validated against [CVXPY](https://www.cvxpy.org/) + [Clarabel](https://clarabel.org/) reference solutions (see [`validation`](validation)).
