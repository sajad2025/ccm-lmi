# LMI Solver Backend

This is the backend service for solving Linear Matrix Inequalities (LMIs) using CVXPY.

## Setup

1. Create a Python virtual environment:
```bash
python3 -m venv venv
```

2. Activate the virtual environment:
```bash
source venv/bin/activate  # On Unix/macOS
# OR
.\venv\Scripts\activate  # On Windows
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

Start the FastAPI server:
```bash
uvicorn main:app --reload --port 8000
```

The server will be available at http://localhost:8000.

## API Endpoints

### POST /solve-lmi

Solves the LMI optimization problem:
```
minimize     trace(W)
subject to   H = AW + WA^T - ρBB^T + WQW ≺ 0
             α_min*I ≼ W ≼ α_max*I
```

Request body:
```json
{
    "state_values": {"state1": 0.0, "state2": 0.0},
    "matrix_a": [[0.0, 1.0], [-1.0, 0.0]],
    "matrix_b": [[0.0], [1.0]],
    "matrix_q": [1.0, 1.0],
    "alpha_min": 0.2,
    "alpha_max": 1.2,
    "n": 2
}
```

Response:
```json
{
    "feasible": true,
    "W": [[1.0, 0.0], [0.0, 1.0]],
    "rho": 0.5,
    "min_eig_h": -0.1,
    "max_eig_h": -0.05
}
```

## Notes

- The solver uses MOSEK if available, otherwise falls back to SCS.
- For better performance, consider installing MOSEK (requires a license) or other supported solvers. 