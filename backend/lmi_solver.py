import numpy as np
import cvxpy as cp
from typing import List, Dict, Tuple, Optional

def solve_lmi(
    state_values: Dict[str, float],
    A: np.ndarray,
    B: np.ndarray,
    Q: np.ndarray,  # Used for Cholesky decomposition L*L^T = Q
    alpha_min: float,
    alpha_max: float,
    n: int,
    lambda_val: float = 1.0,
    use_d_constraint: bool = False
) -> Dict:
    """
    Solve the LMI feasibility problem with either H<0 or D≥0 constraint:
    find       W, ρ
    subject to either:
        1) H = A*W + W*A^T - ρBB^T + 2λW < 0
           α_min*I ≼ W ≼ α_max*I
           W = W^T ≻ 0
    or:
        2) D = [-W*A^T - A*W + ρBB^T,   W*L^T;
                L*W,                     I] ≥ 0
           α_min*I ≼ W ≼ α_max*I
           W = W^T ≻ 0
    where L*L^T = Q (Cholesky decomposition)
    """
    try:
        print("\nDEBUG: Starting LMI solver")
        print("Input dimensions:")
        print(f"A: {A.shape}")
        print(f"B: {B.shape}")
        print(f"Q: {Q.shape}")
        print(f"n: {n}")
        
        print("\nInput matrices:")
        print("A =\n", A)
        print("\nB =\n", B)
        print("\nQ =\n", Q)
        print(f"\nParameters:")
        print(f"α_min = {alpha_min}")
        print(f"α_max = {alpha_max}")
        print(f"λ = {lambda_val}")
        print(f"Using D constraint: {use_d_constraint}")
        
        # Create variables
        print("\nCreating optimization variables")
        W = cp.Variable((n, n), symmetric=True)
        rho = cp.Variable()
        
        # Create identity matrix
        I_n = np.eye(n)
        
        # Compute Cholesky decomposition of Q
        try:
            L = np.linalg.cholesky(Q).T  # Using transpose to get upper triangular L
            print("\nCholesky decomposition successful")
            print("L =\n", L)
        except np.linalg.LinAlgError:
            print("\nWarning: Q is not positive definite. Using sqrt(diag(Q)) instead.")
            L = np.diag(np.sqrt(np.diag(Q)))
            print("L =\n", L)
        
        # Form BB^T
        BB_T = B @ B.T
        print("\nBB^T =\n", BB_T)
        
        # Set up constraints for W and rho
        print("\nSetting up constraints")
        constraints = [
            W >> alpha_min * I_n,  # W ≻ α_min*I
            W << alpha_max * I_n,  # W ≺ α_max*I
            rho >= 0  # ρ must be non-negative
        ]
        
        # Add either H negative definite or D positive semidefinite constraint
        eps = 1e-8
        if use_d_constraint:
            # Form the D matrix
            D11 = -W @ A.T - A @ W + rho * BB_T
            D12 = W @ L.T
            D21 = L @ W
            D22 = I_n
            
            # Form the block matrix D
            D = cp.bmat([[D11, D12],
                        [D21, D22]])
            
            # Add D ≥ 0 constraint
            constraints.append(D >> -eps * np.eye(2*n))
            print("\nUsing D ≥ 0 constraint")
            
        else:
            # Form the H matrix
            H = A @ W + W @ A.T - rho * BB_T + 2 * lambda_val * W
            constraints.append(H << -eps * I_n)
            print("\nUsing H < 0 constraint")
        
        print("\nConstraints:")
        print(f"1. W ≻ {alpha_min}*I")
        print(f"2. W ≺ {alpha_max}*I")
        print(f"3. ρ ≥ 0")
        if use_d_constraint:
            print(f"4. D ≽ -{eps}*I")
        else:
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
                
                # Calculate M = W^(-1)
                M_val = np.linalg.inv(W_val)
                print("\nM = W^(-1) =\n", M_val)
                
                # Verify solution
                print("\nVerifying solution:")
                if use_d_constraint:
                    D11_val = -W_val @ A.T - A @ W_val + rho_val * BB_T
                    D12_val = W_val @ L.T
                    D21_val = L @ W_val
                    D22_val = I_n
                    D_val = np.block([[D11_val, D12_val],
                                    [D21_val, D22_val]])
                    print("D =\n", D_val)
                    
                    # Get eigenvalues of D
                    eig_D = np.linalg.eigvals(D_val)
                    min_eig_D = float(np.real(min(eig_D)))
                    max_eig_D = float(np.real(max(eig_D)))
                    print("\nD eigenvalues:", eig_D)
                    
                else:
                    H_val = A @ W_val + W_val @ A.T - rho_val * BB_T + 2 * lambda_val * W_val
                    print("H =\n", H_val)
                    
                    # Get eigenvalues of H
                    eig_H = np.linalg.eigvals(H_val)
                    min_eig_H = float(np.real(min(eig_H)))
                    max_eig_H = float(np.real(max(eig_H)))
                    print("\nH eigenvalues:", eig_H)
                
                # Get eigenvalues of W
                eig_W = np.linalg.eigvals(W_val)
                min_eig_W = float(np.real(min(eig_W)))
                max_eig_W = float(np.real(max(eig_W)))
                print("\nW eigenvalues:", eig_W)
                
                # Get eigenvalues of M
                eig_M = np.linalg.eigvals(M_val)
                min_eig_M = float(np.real(min(eig_M)))
                max_eig_M = float(np.real(max(eig_M)))
                print("\nM eigenvalues:", eig_M)
                
                # Check constraints
                print("\nConstraint verification:")
                tol = 1e-6
                w_pd = min_eig_W >= -tol
                w_lb = min_eig_W >= alpha_min - tol
                w_ub = max_eig_W <= alpha_max + tol
                rho_pos = rho_val >= -tol
                
                if use_d_constraint:
                    d_pos_def = min_eig_D >= -tol
                    print(f"1. D positive semidefinite: {d_pos_def} (min eig = {min_eig_D:.6f})")
                else:
                    h_neg_def = max_eig_H <= tol
                    print(f"1. H negative definite: {h_neg_def} (max eig = {max_eig_H:.6f})")
                    
                print(f"2. W positive definite: {w_pd} (min eig = {min_eig_W:.6f})")
                print(f"3. W lower bound: {w_lb} (min eig = {min_eig_W:.6f} >= {alpha_min})")
                print(f"4. W upper bound: {w_ub} (max eig = {max_eig_W:.6f} <= {alpha_max})")
                print(f"5. rho positive: {rho_pos} (rho = {rho_val:.6f})")
                
                return {
                    "feasible": True,
                    "W": W_val.tolist(),
                    "M": M_val.tolist(),
                    "rho": rho_val,
                    "min_eig_h": min_eig_H if not use_d_constraint else None,
                    "max_eig_h": max_eig_H if not use_d_constraint else None,
                    "min_eig_d": min_eig_D if use_d_constraint else None,
                    "max_eig_d": max_eig_D if use_d_constraint else None,
                    "min_eig_w": min_eig_W,
                    "max_eig_w": max_eig_W,
                    "min_eig_m": min_eig_M,
                    "max_eig_m": max_eig_M,
                    "solver_info": {
                        "solver_name": str(solver).split('.')[-1],
                        "status": prob.status,
                        "optimal_value": prob.value,
                        "setup_time": prob.compilation_time,
                        "solve_time": prob.solver_stats.solve_time if prob.solver_stats else None
                    },
                    "constraints_violation": {
                        "H_negative_definite": h_neg_def if not use_d_constraint else None,
                        "D_positive_semidefinite": d_pos_def if use_d_constraint else None,
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
            "M": None,
            "rho": 0.0,
            "min_eig_h": None,
            "max_eig_h": None,
            "min_eig_d": None,
            "max_eig_d": None,
            "min_eig_w": 0.0,
            "max_eig_w": 0.0,
            "min_eig_m": 0.0,
            "max_eig_m": 0.0,
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
            "M": None,
            "rho": 0.0,
            "min_eig_h": None,
            "max_eig_h": None,
            "min_eig_d": None,
            "max_eig_d": None,
            "min_eig_w": 0.0,
            "max_eig_w": 0.0,
            "min_eig_m": 0.0,
            "max_eig_m": 0.0,
            "solver_info": {"error": str(e)},
            "constraints_violation": None
        } 