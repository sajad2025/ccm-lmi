# CCM-LMI: Control Contraction Metrics Linear Matrix Inequalities

A web application for analyzing and designing nonlinear control systems using Control Contraction Metrics (CCM) and Linear Matrix Inequalities (LMI).

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

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd backend
   pip install -r requirements.txt
   ```
3. Start the backend server:
   ```bash
   python app.py
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```

## Usage

1. Select a predefined system or define your own
2. Configure system parameters and analysis settings
3. Run the CCM-LMI optimization
4. View results and analyze system properties

## License

MIT License
