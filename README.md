# CCM-LMI: Control Contraction Metrics Linear Matrix Inequalities

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/sajad2025/ccm-lmi/blob/main/LICENSE)

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

1. Clone the repository:
   ```bash
   git clone https://github.com/sajad2025/ccm-lmi.git
   cd ccm-lmi
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Set up the backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   # Make sure you're in the backend directory
   cd backend
   # Make sure the virtual environment is activated
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   # Start the server
   uvicorn main:app --reload
   ```
   The backend server should start and listen on http://localhost:8000

   If you get an "Address already in use" error:
   ```bash
   # Kill any existing uvicorn processes
   pkill -f uvicorn
   # Then try starting the server again
   uvicorn main:app --reload
   ```

5. Start the frontend development server (in a new terminal):
   ```bash
   cd ..  # Go back to the root directory if you're in backend/
   npm run dev
   ```
   The frontend should be available at http://localhost:5173

## Usage

1. Select a predefined system or define your own
2. Configure system parameters and analysis settings
3. Run the CCM-LMI optimization
4. View results and analyze system properties

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Sajad Salmanipour ([@sajad2025](https://github.com/sajad2025))

## License

[MIT License](https://github.com/sajad2025/ccm-lmi/blob/main/LICENSE) © 2025 Sajad Salmanipour

## Troubleshooting

### Backend Server Issues

1. **"Address already in use" error**
   - This means there's already a process running on port 8000
   - Use `pkill -f uvicorn` to kill existing uvicorn processes
   - Try starting the server again

2. **"Could not import module 'main'" error**
   - Make sure you're in the `backend` directory when starting the server
   - Verify that `main.py` exists in the backend directory
   - Ensure all dependencies are installed in your virtual environment

3. **Other Issues**
   - Make sure your virtual environment is activated
   - Check that all dependencies are installed correctly
   - Verify you're using the correct Python version (3.8+)
