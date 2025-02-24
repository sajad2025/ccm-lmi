import numpy as np
import cvxpy as cp
from typing import List, Dict, Tuple, Optional

def solve_lmi(
    state_values: Dict[str, float],
    A: np.ndarray,
    B: np.ndarray,
    Q: np.ndarray,  # Not used in this formulation
    alpha_min: float,
    alpha_max: float,
    n: int,
    lambda_val: float = 1.0
) -> Dict:
    """
    Solve the LMI feasibility problem:
    find       W, ρ
    subject to H = A*W + W*A^T - ρBB^T + 2λW < 0
               α_min*I ≼ W ≼ α_max*I
               W = W^T ≻ 0
    """
    try:
        print("\nDEBUG: Starting LMI solver")
        print("Input dimensions:")
        print(f"A: {A.shape}")
        print(f"B: {B.shape}")
        print(f"n: {n}")
        
        print("\nInput matrices:")
        print("A =\n", A)
        print("\nB =\n", B)
        print(f"\nParameters:")
        print(f"α_min = {alpha_min}")
        print(f"α_max = {alpha_max}")
        print(f"λ = {lambda_val}")
        
        # Create variables
        print("\nCreating optimization variables")
        W = cp.Variable((n, n), symmetric=True)
        rho = cp.Variable()
        
        # Create identity matrix
        I_n = np.eye(n)
        
        # Form the H matrix
        print("\nForming H matrix")
        BB_T = B @ B.T
        print("BB^T =\n", BB_T)
        
        H = A @ W + W @ A.T - rho * BB_T + 2 * lambda_val * W
        print("H matrix expression formed")
        
        # Set up constraints for W and rho
        print("\nSetting up constraints")
        constraints = [
            W >> alpha_min * I_n,  # W ≻ α_min*I
            W << alpha_max * I_n,  # W ≺ α_max*I
            rho >= 0  # ρ must be non-negative
        ]
        
        # Add H negative definite constraint
        # For numerical stability, make it strictly negative definite
        eps = 1e-8
        constraints.append(H << -eps * I_n)
        
        print("\nConstraints:")
        print(f"1. W ≻ {alpha_min}*I")
        print(f"2. W ≺ {alpha_max}*I")
        print(f"3. ρ ≥ 0")
        print(f"4. H ≺ -{eps}*I")
        
        # Create feasibility problem
        print("\nSetting up optimization problem")
        prob = cp.Problem(cp.Minimize(rho), constraints)
        
        # Try MOSEK first
        if cp.MOSEK in cp.installed_solvers():
            solver = cp.MOSEK
            solver_opts = {
                'verbose': True,
                'MSK_DPAR_INTPNT_CO_TOL_PFEAS': 1e-8,
                'MSK_DPAR_INTPNT_CO_TOL_DFEAS': 1e-8
            }
            print("\nUsing MOSEK solver")
        else:
            solver = cp.SCS
            solver_opts = {
                'verbose': True,
                'eps': 1e-8,
                'max_iters': 10000
            }
            print("\nUsing SCS solver")
        
        try:
            print("\nSolving optimization problem...")
            result = prob.solve(solver=solver, **solver_opts)
            print(f"Solver status: {prob.status}")
            
            if prob.status in ["optimal", "optimal_inaccurate"]:
                print("\nSolution found!")
                W_val = W.value
                rho_val = float(rho.value)
                print(f"W =\n{W_val}")
                print(f"ρ = {rho_val}")
                
                # Verify solution
                print("\nVerifying solution:")
                H_val = A @ W_val + W_val @ A.T - rho_val * BB_T + 2 * lambda_val * W_val
                print("H =\n", H_val)
                
                # Get eigenvalues
                eig_H = np.linalg.eigvals(H_val)
                min_eig_H = float(np.real(min(eig_H)))
                max_eig_H = float(np.real(max(eig_H)))
                
                eig_W = np.linalg.eigvals(W_val)
                min_eig_W = float(np.real(min(eig_W)))
                max_eig_W = float(np.real(max(eig_W)))
                
                print("\nEigenvalue analysis:")
                print(f"H eigenvalues: [{min_eig_H:.6f}, {max_eig_H:.6f}]")
                print(f"W eigenvalues: [{min_eig_W:.6f}, {max_eig_W:.6f}]")
                
                # Check constraints
                print("\nConstraint verification:")
                tol = 1e-6
                h_neg_def = max_eig_H <= tol
                w_pd = min_eig_W >= -tol
                w_lb = min_eig_W >= alpha_min - tol
                w_ub = max_eig_W <= alpha_max + tol
                rho_pos = rho_val >= -tol
                
                print(f"1. H negative definite: {h_neg_def} (max eig = {max_eig_H:.6f})")
                print(f"2. W positive definite: {w_pd} (min eig = {min_eig_W:.6f})")
                print(f"3. W lower bound: {w_lb} (min eig = {min_eig_W:.6f} >= {alpha_min})")
                print(f"4. W upper bound: {w_ub} (max eig = {max_eig_W:.6f} <= {alpha_max})")
                print(f"5. rho positive: {rho_pos} (rho = {rho_val:.6f})")
                
                return {
                    "feasible": True,
                    "W": W_val.tolist(),
                    "rho": rho_val,
                    "min_eig_h": min_eig_H,
                    "max_eig_h": max_eig_H,
                    "min_eig_w": min_eig_W,
                    "max_eig_w": max_eig_W,
                    "solver_info": {
                        "solver_name": str(solver).split('.')[-1],
                        "status": prob.status,
                        "optimal_value": prob.value,
                        "setup_time": prob.compilation_time,
                        "solve_time": prob.solver_stats.solve_time if prob.solver_stats else None
                    },
                    "constraints_violation": {
                        "H_negative_definite": h_neg_def,
                        "W_positive_definite": w_pd,
                        "W_lower_bound": w_lb,
                        "W_upper_bound": w_ub,
                        "rho_positive": rho_pos
                    }
                }
            
        except Exception as e:
            print(f"\nSolver error: {str(e)}")
            print("Error details:", e.__class__.__name__)
            if hasattr(e, 'args'):
                print("Error args:", e.args)
        
        print("\nProblem infeasible or solver failed")
        return {
            "feasible": False,
            "W": None,
            "rho": 0.0,
            "min_eig_h": 0.0,
            "max_eig_h": 0.0,
            "min_eig_w": 0.0,
            "max_eig_w": 0.0,
            "solver_info": {"status": "error"},
            "constraints_violation": None
        }
            
    except Exception as e:
        print(f"\nUnexpected error: {str(e)}")
        print("Error type:", e.__class__.__name__)
        if hasattr(e, 'args'):
            print("Error args:", e.args)
        return {
            "feasible": False,
            "W": None,
            "rho": 0.0,
            "min_eig_h": 0.0,
            "max_eig_h": 0.0,
            "min_eig_w": 0.0,
            "max_eig_w": 0.0,
            "solver_info": {"error": str(e)},
            "constraints_violation": None
        } 