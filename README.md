# CCM-LMI: Control Contraction Metrics Linear Matrix Inequalities

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/sajad2025/ccm-lmi/blob/main/LICENSE)

A web application for analyzing and designing nonlinear control systems using
Control Contraction Metrics (CCM) and Linear Matrix Inequalities (LMI).

**Runs entirely in your browser — no backend, no server, no install.** It can be
added to a phone home screen as an installable, offline-capable app (PWA).

## Background

Control Contraction Metrics (CCM) provide a powerful framework for nonlinear control system design and analysis. This approach combines differential geometry with convex optimization to establish robust stability and performance guarantees for nonlinear systems. The method relies on constructing a Riemannian metric that contracts in closed loop, which can be verified through Linear Matrix Inequalities (LMI).

The key advantages of CCM include:
- Convex conditions for nonlinear controller synthesis
- Explicit bounds on convergence rates
- Robustness guarantees
- Applicability to a wide range of nonlinear systems

This tool implements the CCM-LMI optimization framework described in the following seminal papers:

1. [Control Contraction Metrics: Convex and Intrinsic Criteria for Nonlinear Feedback Design](https://arxiv.org/pdf/1503.03144) by Manchester, I.R. and Slotine, J.J.E. (2017), published in IEEE Transactions on Automatic Control. This paper introduces the fundamental theory of CCM and establishes the convex LMI conditions for controller synthesis.

2. [Unifying Robot Trajectory Tracking with Control Contraction Metrics](https://books.google.com/books?hl=en&lr=&id=RRsuDwAAQBAJ&oi=fnd&pg=PA403) by Manchester, I.R., Tang, J.Z. and Slotine, J.J.E. (2018), published in Robotics Research. This work demonstrates the application of CCM to robot control and trajectory tracking problems.

## Features

- Interactive system configuration
- Real-time LMI analysis
- Visualization of system behavior
- Support for custom nonlinear systems
- Automatic computation of Jacobian matrices
- Constraint verification and feasibility analysis

## How it works (architecture)

Everything runs client-side — there is no network call at all:

- **Symbolic Jacobian, eigenvalue grid analysis, RK4 simulation, animations and
  plots** are computed in JavaScript with [`mathjs`](https://mathjs.org/) and
  React.
- **The CCM-LMI semidefinite program** is solved by a small pure-TypeScript
  interior-point solver in [`src/solver/sdpSolver.ts`](src/solver/sdpSolver.ts):
  it bisects on the objective ρ and, at each ρ, solves a max-margin LMI
  feasibility problem with a log-det-barrier / Newton method (the matrix blocks
  are tiny — W is n×n with n ≤ 4, the D-block ≤ 8×8 — so dense linear algebra is
  instant). [`src/solver/localSolver.ts`](src/solver/localSolver.ts) adapts it to
  the app.

This replaces the former Python/FastAPI + [CVXPY](https://www.cvxpy.org/)/[Clarabel](https://clarabel.org/)
backend. (The browser route through that stack via WebAssembly was ruled out:
Clarabel's semidefinite cone needs BLAS/LAPACK, which do not compile to
`wasm32`, so cvxpy-in-Pyodide crashes on the SDP.) The pure-JS solver was
validated against the original cvxpy/Clarabel results across a 45-case sweep
(pendulum, cart-pole, and randomized n=1–4 systems, both the H and D
constraints) — feasibility verdicts match exactly and ρ agrees to a relative
error below 3×10⁻⁴.

Because the solver is plain JavaScript, the whole app is a static bundle with no
download beyond the page itself, and it works fully offline.

## Getting Started

Requires Node.js 18+.

```bash
git clone https://github.com/sajad2025/ccm-lmi.git
cd ccm-lmi
npm install
npm run dev
```

The app is available at http://localhost:5173/ccm-lmi/ (the `/ccm-lmi/` path
matches the GitHub Pages `base`).

To produce an optimized static build:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Usage

1. Select a predefined system or define your own
2. Configure system parameters and analysis settings
3. Click **Analyze** to run the CCM-LMI optimization (solved locally, instantly)
4. Run the open- or closed-loop simulation and view the results

## Deployment

The app is a static site and ships as a Progressive Web App (PWA), so it can be
hosted anywhere static files are served and installed to a phone home screen.

This repo includes a GitHub Actions workflow
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that builds and
deploys to **GitHub Pages** on every push to `main`. To enable it, set
*Settings → Pages → Build and deployment → Source* to **GitHub Actions**. The
site is then served at `https://<user>.github.io/ccm-lmi/` (the `base` path is
configured in [`vite.config.ts`](vite.config.ts)).

On a phone, open the deployed URL and choose **Add to Home Screen** to install it
as an offline app.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Sajad Salmanipour ([@sajad2025](https://github.com/sajad2025))

## License

[MIT License](https://github.com/sajad2025/ccm-lmi/blob/main/LICENSE) © 2025 Sajad Salmanipour
