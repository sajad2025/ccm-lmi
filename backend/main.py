from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List
import numpy as np
from lmi_solver import solve_lmi

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LMIRequest(BaseModel):
    state_values: Dict[str, float]
    matrix_a: List[List[float]]
    matrix_b: List[List[float]]
    matrix_q: List[float]
    alpha_min: float
    alpha_max: float
    n: int
    lambda_val: float
    use_d_constraint: bool = False  # New parameter with default value False

@app.post("/solve-lmi")
async def solve_lmi_endpoint(request: LMIRequest):
    try:
        # Convert lists to numpy arrays
        A = np.array(request.matrix_a)
        B = np.array(request.matrix_b)
        Q = np.diag(request.matrix_q)
        
        # Solve LMI
        result = solve_lmi(
            request.state_values,
            A,
            B,
            Q,
            request.alpha_min,
            request.alpha_max,
            request.n,
            request.lambda_val,
            request.use_d_constraint
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 