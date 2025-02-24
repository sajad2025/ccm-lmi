import { useState, useEffect } from 'react';
import './App.css'
import * as math from 'mathjs';
import axios from 'axios';

interface Signal {
  name: string;
  min: number;
  max: number;
}

interface MatrixElement {
  expression: string;
}

interface JacobianElement {
  expression: string;
}

interface EigenvalueAnalysis {
  minRealEig: number;
  maxRealEig: number;
  minImagEig: number;
  maxImagEig: number;
  gridPoints: number;
}

interface LMIAnalysis {
  minEigH: number;
  maxEigH: number;
  feasible: boolean;
  W: number[][];
  rho: number;
  minEigW: number;
  maxEigW: number;
  solverInfo: {
    solverName: string;
    setupTime: number | null;
    solveTime: number | null;
    status: string;
    optimalValue: number | null;
  };
  constraintsViolation: {
    H_negative_definite: boolean;
    W_positive_definite: boolean;
    W_lower_bound: boolean;
    W_upper_bound: boolean;
    rho_positive: boolean;
  } | null;
}

interface SystemConfig {
  name: string;
  n: number;
  m: number;
  states: Signal[];
  matrixA: MatrixElement[][];
  matrixB: MatrixElement[][];
  lmiParams: {
    lambda: number;
    alphaMin: number;
    alphaMax: number;
  };
  matrixQ: number[];
}

function App() {
  const systemConfigs: Record<string, SystemConfig> = {
    'empty': {
      name: 'Empty System',
      n: 1,
      m: 1,
      states: [
        { name: '', min: -0.1, max: 0.1 }
      ],
      matrixA: [
        [{ expression: '0' }]
      ],
      matrixB: [
        [{ expression: '0' }]
      ],
      lmiParams: {
        lambda: 0.5,
        alphaMin: 0.01,
        alphaMax: 5.0
      },
      matrixQ: [1]
    },
    'fully-actuated-pendulum': {
      name: 'Fully-Actuated Inverted Pendulum',
      n: 2,
      m: 1,
      states: [
        { name: 'theta', min: -0.5, max: 0.5 },
        { name: 'omega', min: -0.5, max: 0.5 }
      ],
      matrixA: [
        [{ expression: 'omega' }],
        [{ expression: '-sin(theta)-0.1*omega' }]
      ],
      matrixB: [
        [{ expression: '0' }],
        [{ expression: '1' }]
      ],
      lmiParams: {
        lambda: 1,
        alphaMin: 0.5,
        alphaMax: 5.0
      },
      matrixQ: [0, 0]
    },
    'under-actuated-cartpole': {
      name: 'Under-Actuated Cart-Pole',
      n: 4,
      m: 1,
      states: [
        { name: 'theta', min: -0.75, max: 0.75 },
        { name: 'eta', min: -0.5, max: 0.5 },
        { name: 'p', min: -0.2, max: 0.2 },
        { name: 'v', min: -1, max: 1 }
      ],
      matrixA: [
        [{ expression: 'eta*cos(theta)' }],
        [{ expression: 'eta^2*sin(theta)+tan(theta)' }],
        [{ expression: 'v' }],
        [{ expression: '0' }]
      ],
      matrixB: [
        [{ expression: '0' }],
        [{ expression: '-1' }],
        [{ expression: '0' }],
        [{ expression: '1' }]
      ],
      lmiParams: {
        lambda: 0.1,
        alphaMin: 0.1,
        alphaMax: 5.0
      },
      matrixQ: [1, 1, 15, 1]
    }
  };

  const loadSystemConfig = (configKey: string) => {
    const config = systemConfigs[configKey];
    if (!config) return;

    // First update dimensions to match the config
    setSystemDimensions({ n: config.n, m: config.m });
    
    // Reset states array to match config
    const newStates = Array(config.n).fill(null).map((_, i) => 
      i < config.states.length ? config.states[i] : { name: '', min: -0.1, max: 0.1 }
    );
    setStates(newStates);

    // Reset matrices to match config dimensions
    const newMatrixA = Array(config.n).fill(null).map((_) => 
      Array(1).fill(null).map(() => ({ expression: '0' }))
    );
    const newMatrixB = Array(config.n).fill(null).map((_) => 
      Array(config.m).fill(null).map(() => ({ expression: '0' }))
    );

    // Then apply the config matrices
    config.matrixA.forEach((row, i) => {
      if (i < newMatrixA.length) {
        newMatrixA[i] = [...row];
      }
    });
    config.matrixB.forEach((row, i) => {
      if (i < newMatrixB.length) {
        newMatrixB[i] = [...row];
      }
    });

    setMatrixA(newMatrixA);
    setMatrixB(newMatrixB);
    setLmiParams(config.lmiParams);
    
    // Update Q matrix to match new state dimension
    setMatrixQ(config.matrixQ);
  };

  const getValidSignalCount = (n: number) => {
    if (isNaN(n) || n <= 0 || n > 4) return 1;
    return n;
  };

  const getValidDimension = (value: number) => {
    if (isNaN(value) || value < 1) return 1;
    return value;
  };

  const [systemDimensions, setSystemDimensions] = useState({
    n: 4, // State dimension
    m: 1  // Input dimension
  });

  const [states, setStates] = useState<Signal[]>(() => [
    { name: 'theta', min: -0.75, max: 0.75 },
    { name: 'eta', min: -0.5, max: 0.5 },
    { name: 'p', min: -0.2, max: 0.2 },
    { name: 'v', min: -1, max: 1 }
  ]);

  const [timeVector, setTimeVector] = useState({
    duration: 10,
    sampleTime: 0.1
  });

  const [matrixA, setMatrixA] = useState<MatrixElement[][]>(() => [
    [{ expression: 'eta*cos(theta)' }],
    [{ expression: 'eta^2*sin(theta)+tan(theta)' }],
    [{ expression: 'v' }],
    [{ expression: '0' }]
  ]);

  const [matrixB, setMatrixB] = useState<MatrixElement[][]>(() => [
    [{ expression: '0' }],
    [{ expression: '-1' }],
    [{ expression: '0' }],
    [{ expression: '1' }]
  ]);

  const [jacobianMatrix, setJacobianMatrix] = useState<JacobianElement[][]>(() => 
    Array(systemDimensions.n).fill(null).map(() => 
      Array(systemDimensions.n).fill(null).map(() => ({ expression: '' }))
    )
  );

  const [gridSize, setGridSize] = useState(0.2);
  const [eigenAnalysis, setEigenAnalysis] = useState<EigenvalueAnalysis>({
    minRealEig: 0,
    maxRealEig: 0,
    minImagEig: 0,
    maxImagEig: 0,
    gridPoints: 0
  });

  const [lmiParams, setLmiParams] = useState({
    lambda: 0.1,
    alphaMin: 0.1,
    alphaMax: 5.0
  });

  const [matrixQ, setMatrixQ] = useState<number[]>([1, 1, 15, 1]);  // Cart-pole Q matrix values

  const [lmiAnalysis, setLmiAnalysis] = useState<LMIAnalysis>({
    minEigH: 0,
    maxEigH: 0,
    feasible: false,
    W: Array(4).fill(0).map(() => Array(4).fill(0)),
    rho: 0,
    minEigW: 0,
    maxEigW: 0,
    solverInfo: {
      solverName: '',
      setupTime: null,
      solveTime: null,
      status: '',
      optimalValue: null
    },
    constraintsViolation: null
  });


  const getDerivative = (expression: string, variable: string): string => {
    if (!expression || expression.trim() === '' || expression === '0') return '0';
    if (!variable || variable.trim() === '') return '0';
    
    try {
      // First validate if the expression is parseable
      const node = math.parse(expression);
      if (!node) return '0';
      
      // Calculate the derivative
      const derivative = math.derivative(node, variable);
      if (!derivative) return '0';
      
      // Simplify the result
      const simplified = math.simplify(derivative);
      return simplified.toString();
    } catch (error) {
      console.error('Error calculating derivative:', error);
      return '0';
    }
  };

  const calculateJacobian = (fExpressions: MatrixElement[][], stateNames: string[]) => {
    const n = systemDimensions.n;
    const newJacobian = Array(n).fill(null).map(() => 
      Array(n).fill(null).map(() => ({ expression: '0' }))
    );

    // For each element in f vector
    for (let i = 0; i < n; i++) {
      const fExpr = fExpressions[i][0].expression.trim();
      if (!fExpr) continue;
      
      // For each state variable
      for (let j = 0; j < n; j++) {
        const stateName = (stateNames[j] || `x${j+1}`).trim();
        if (!stateName) continue;
        
        // Calculate the partial derivative
        newJacobian[i][j] = { 
          expression: getDerivative(fExpr, stateName)
        };
      }
    }

    setJacobianMatrix(newJacobian);
  };

  useEffect(() => {
    calculateJacobian(matrixA, states.map(s => s.name));
  }, [matrixA, states, systemDimensions.n]);

  // Load cart-pole system by default
  useEffect(() => {
    loadSystemConfig('under-actuated-cartpole');
  }, []);

  const handleStateChange = (index: number, field: keyof Signal, value: string | number) => {
    const newStates = [...states];
    newStates[index] = { ...newStates[index], [field]: value };
    setStates(newStates);
  };

  const handleDimensionChange = (field: 'n' | 'm', value: number) => {
    const validValue = getValidDimension(value);
    const newDimensions = { ...systemDimensions, [field]: validValue };
    setSystemDimensions(newDimensions);
    
    // Update matrices when dimensions change
    if (field === 'n') {
      // Update states array length
      setStates(prevStates => {
        const validCount = getValidSignalCount(validValue);
        const newStates = Array(validCount).fill(null).map((_, i) => 
          i < prevStates.length ? prevStates[i] : { name: '', min: 0, max: 1 }
        );
        return newStates;
      });
      
      setMatrixA(Array(validValue).fill(null).map(() => 
        Array(1).fill(null).map(() => ({ expression: '0' }))
      ));
      setMatrixB(Array(validValue).fill(null).map(() => 
        Array(systemDimensions.m).fill(null).map(() => ({ expression: '0' }))
      ));
      
      // Update Q matrix to match new state dimension
      setMatrixQ(Array(validValue).fill(1));
    } else if (field === 'm') {
      setMatrixB(Array(systemDimensions.n).fill(null).map(() => 
        Array(validValue).fill(null).map(() => ({ expression: '0' }))
      ));
    }
  };

  const handleMatrixChange = (
    matrix: 'A' | 'B',
    row: number,
    col: number,
    value: string
  ) => {
    if (matrix === 'A') {
      const newMatrix = [...matrixA];
      newMatrix[row][col] = { expression: value };
      setMatrixA(newMatrix);
    } else {
      const newMatrix = [...matrixB];
      newMatrix[row][col] = { expression: value };
      setMatrixB(newMatrix);
    }
  };

  const evaluateJacobianAtPoint = (stateValues: Record<string, number>) => {
    const n = systemDimensions.n;
    const jacobianArray = Array(n).fill(0).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const derivative = jacobianMatrix[i][j].expression;
        
        try {
          if (derivative === '0') {
            jacobianArray[i][j] = 0;
          } else {
            const result = math.evaluate(derivative, stateValues);
            jacobianArray[i][j] = Number(result);
          }
        } catch (error) {
          console.error('Error evaluating derivative:', derivative, 'at point:', stateValues);
          jacobianArray[i][j] = 0;
        }
      }
    }
    
    return jacobianArray;
  };

  const analyzeEigenvalues = () => {
    const n = systemDimensions.n;
    let minReal = Infinity;
    let maxReal = -Infinity;
    let minImag = Infinity;
    let maxImag = -Infinity;
    let totalPoints = 0;

    // Create grid points for each state
    const gridPoints = states.map(state => {
      const range = state.max - state.min;
      if (range === 0) {
        return [state.min]; // Just return the single point if min equals max
      }
      const numPoints = Math.max(2, Math.ceil(range / gridSize));
      const step = range / (numPoints - 1);
      return Array.from({ length: numPoints }, (_, i) => state.min + i * step);
    });

    // Helper function to generate all combinations
    const generateStatePoints = (current: number[], depth: number): void => {
      if (depth === n) {
        // Create state values object
        const stateValues: Record<string, number> = {};
        states.forEach((state, i) => {
          const stateName = state.name || `x${i+1}`;
          stateValues[stateName] = current[i];
        });

        try {
          // Evaluate Jacobian at this point
          const jacobian = evaluateJacobianAtPoint(stateValues);
          console.log('State values:', stateValues);
          console.log('Jacobian matrix:', jacobian);
          
          // Calculate eigenvalues
          try {
            const result = math.eigs(jacobian);
            console.log('Raw eigenvalues:', result);
            
            if (result && Array.isArray(result.values)) {
              result.values.forEach((value: any) => {
                try {
                  // Try to get real and imaginary parts
                  let re = 0, im = 0;
                  
                  if (typeof value === 'number') {
                    re = value;
                    im = 0;
                  } else if (math.typeOf(value) === 'Complex') {
                    re = Number(value.re || 0);
                    im = Number(value.im || 0);
                  } else {
                    console.warn('Unknown eigenvalue type:', value);
                    return;
                  }
                  
                  console.log('Processed eigenvalue:', { re, im });
                  
                  if (!isNaN(re)) {
                    minReal = Math.min(minReal, re);
                    maxReal = Math.max(maxReal, re);
                  }
                  if (!isNaN(im)) {
                    minImag = Math.min(minImag, im);
                    maxImag = Math.max(maxImag, im);
                  }
                } catch (eigError) {
                  console.error('Error processing eigenvalue:', value, eigError);
                }
              });
            } else {
              console.warn('Invalid eigenvalues result:', result);
            }
          } catch (eigsError) {
            console.error('Error calculating eigenvalues:', eigsError);
          }
          
          totalPoints++;
        } catch (error) {
          console.error('Error in eigenvalue analysis at point:', stateValues, error);
        }
        return;
      }

      // Use the actual number of points for this dimension
      const numPoints = gridPoints[depth].length;
      for (let i = 0; i < numPoints; i++) {
        current[depth] = gridPoints[depth][i];
        generateStatePoints(current, depth + 1);
      }
    };

    // Start the recursive grid evaluation
    generateStatePoints(new Array(n).fill(0), 0);

    // Update analysis results
    setEigenAnalysis({
      minRealEig: minReal === Infinity ? 0 : minReal,
      maxRealEig: maxReal === -Infinity ? 0 : maxReal,
      minImagEig: minImag === Infinity ? 0 : minImag,
      maxImagEig: maxImag === -Infinity ? 0 : maxImag,
      gridPoints: totalPoints
    });
  };

  const analyzeLMI = async () => {
    const n = systemDimensions.n;
    
    try {
      // Create state values object
      const stateValues: Record<string, number> = {};
      states.forEach((state, i) => {
        const stateName = state.name || `x${i+1}`;
        stateValues[stateName] = (state.max + state.min) / 2; // Use midpoint for optimization
      });

      // Get Jacobian at this point for matrix A
      const A = evaluateJacobianAtPoint(stateValues);
      
      // Convert matrix B to numeric array
      const B = matrixB.map(row => [Number(row[0].expression)]);

      // Make API request to solve LMI
      const response = await axios.post('http://localhost:8000/solve-lmi', {
        state_values: stateValues,
        matrix_a: A,
        matrix_b: B,
        matrix_q: matrixQ,
        alpha_min: lmiParams.alphaMin,
        alpha_max: lmiParams.alphaMax,
        lambda_val: lmiParams.lambda,
        n: systemDimensions.n
      });

      const result = response.data;
      
      setLmiAnalysis({
        minEigH: result.min_eig_h,
        maxEigH: result.max_eig_h,
        feasible: result.feasible,
        W: result.W || Array(n).fill(0).map(() => Array(n).fill(0)),
        rho: result.rho,
        minEigW: result.min_eig_w,
        maxEigW: result.max_eig_w,
        solverInfo: {
          solverName: result.solver_info.solver_name || '',
          setupTime: result.solver_info.setup_time || null,
          solveTime: result.solver_info.solve_time || (result.solver_info.status === 'optimal' ? 0.001 : null),
          status: result.solver_info.status || 'error',
          optimalValue: result.solver_info.optimal_value || null
        },
        constraintsViolation: result.constraints_violation
      });

    } catch (error) {
      console.error('Error in LMI analysis:', error);
      setLmiAnalysis({
        minEigH: 0,
        maxEigH: 0,
        feasible: false,
        W: Array(n).fill(0).map(() => Array(n).fill(0)),
        rho: 0,
        minEigW: 0,
        maxEigW: 0,
        solverInfo: {
          solverName: '',
          setupTime: null,
          solveTime: null,
          status: 'error',
          optimalValue: null
        },
        constraintsViolation: null
      });
    }
  };

  return (
    <div className="app-container">
      <div className="controls-panel">
        <h2>State Space</h2>
        
        {/* System Selection */}
        <div className="control-section">
          <div className="system-selector">
            <label>System:</label>
            <select 
              onChange={(e) => loadSystemConfig(e.target.value)}
              className="system-select"
              defaultValue="under-actuated-cartpole"
            >
              {Object.entries(systemConfigs).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Vector Settings */}
        <div className="control-section">
          <div className="time-vector-controls">
            <h3>Time (s)</h3>
            <div className="time-input-group">
              <label>Duration:</label>
              <input
                type="number"
                value={timeVector.duration}
                onChange={(e) => setTimeVector({ ...timeVector, duration: parseFloat(e.target.value) })}
                min="0"
                step="0.1"
                className="time-input"
              />
            </div>
            <div className="time-input-group">
              <label>Sample:</label>
              <input
                type="number"
                value={timeVector.sampleTime}
                onChange={(e) => setTimeVector({ ...timeVector, sampleTime: parseFloat(e.target.value) })}
                min="0.001"
                step="0.001"
                className="time-input"
              />
            </div>
          </div>
        </div>

        {/* Dimensions Configuration */}
        <div className="control-section">
          <div className="dimensions-controls">
            <h3>Dimensions</h3>
            <div className="dimension-input-group">
              <label>States (n):</label>
              <input
                type="number"
                min="1"
                value={systemDimensions.n}
                onChange={(e) => handleDimensionChange('n', parseInt(e.target.value))}
                className="dimension-input"
              />
            </div>
            <div className="dimension-input-group">
              <label>Inputs (m):</label>
              <input
                type="number"
                min="1"
                value={systemDimensions.m}
                onChange={(e) => handleDimensionChange('m', parseInt(e.target.value))}
                className="dimension-input"
              />
            </div>
          </div>
        </div>
        
        {/* States Configuration */}
        <div className="control-section">
          <h3>States</h3>
          <div className="states-grid">
            <div className="state-header">
              <span>Name</span>
              <span>Min</span>
              <span>Max</span>
            </div>
            {states.slice(0, getValidSignalCount(systemDimensions.n)).map((state, index) => (
              <div key={`state-${index}`} className="state-row">
                <input
                  type="text"
                  placeholder={`State ${index + 1}`}
                  value={state.name}
                  onChange={(e) => handleStateChange(index, 'name', e.target.value)}
                  className="state-input"
                />
                <input
                  type="number"
                  step="0.5"
                  value={state.min}
                  onChange={(e) => handleStateChange(index, 'min', parseFloat(e.target.value))}
                  className="state-input"
                />
                <input
                  type="number"
                  step="0.5"
                  value={state.max}
                  onChange={(e) => handleStateChange(index, 'max', parseFloat(e.target.value))}
                  className="state-input"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Matrices Configuration */}
        <div className="control-section">
          <h3 style={{ marginBottom: '16px', fontStyle: 'italic' }}>ẋ = f(x) + Bu</h3>
          <div className="matrices-container">
            <div className="matrix-section">
              <h3>f ({systemDimensions.n}×1)</h3>
              <div className="matrix-grid">
                {matrixA.map((row, i) => (
                  <div key={`f-row-${i}`} className="matrix-row">
                    {row.map((cell, j) => (
                      <input
                        key={`f-${i}-${j}`}
                        type="text"
                        value={cell.expression}
                        onChange={(e) => handleMatrixChange('A', i, j, e.target.value)}
                        placeholder={`f${i+1}`}
                        className="matrix-input"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="matrix-section">
              <h3>B ({systemDimensions.n}×{systemDimensions.m})</h3>
              <div className="matrix-grid">
                {matrixB.map((row, i) => (
                  <div key={`B-row-${i}`} className="matrix-row">
                    {row.map((cell, j) => (
                      <input
                        key={`B-${i}-${j}`}
                        type="text"
                        value={cell.expression}
                        onChange={(e) => handleMatrixChange('B', i, j, e.target.value)}
                        placeholder={`B${i+1}${j+1}`}
                        className="matrix-input"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Jacobian Matrix Display */}
        <div className="control-section">
          <h3>A ({systemDimensions.n}×{systemDimensions.n} Jacobian)</h3>
          <div className="matrix-grid">
            {jacobianMatrix.map((row, i) => (
              <div key={`jacobian-row-${i}`} className="matrix-row">
                {row.map((cell, j) => (
                  <div
                    key={`jacobian-${i}-${j}`}
                    className="jacobian-cell"
                    title={`∂f${i+1}/∂x${j+1}`}
                  >
                    {cell.expression || `∂f${i+1}/∂x${j+1}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="analysis-panel">
        <h2>Analysis</h2>
        
        {/* Combined LMI and Grid Analysis Settings */}
        <div className="control-section">
          <h3>Analysis Settings</h3>
          <div className="analysis-settings">
            <div className="settings-row">
              <div className="parameter-group">
                <label>λ:</label>
                <input
                  type="number"
                  step="0.1"
                  value={lmiParams.lambda}
                  onChange={(e) => setLmiParams({...lmiParams, lambda: parseFloat(e.target.value)})}
                  className="parameter-input"
                />
              </div>
            </div>
            <div className="settings-row">
              <div className="parameter-group">
                <label>α min:</label>
                <input
                  type="number"
                  step="0.01"
                  value={lmiParams.alphaMin}
                  onChange={(e) => setLmiParams({...lmiParams, alphaMin: parseFloat(e.target.value)})}
                  className="parameter-input"
                />
              </div>
              <div className="parameter-group">
                <label>α max:</label>
                <input
                  type="number"
                  step="0.01"
                  value={lmiParams.alphaMax}
                  onChange={(e) => setLmiParams({...lmiParams, alphaMax: parseFloat(e.target.value)})}
                  className="parameter-input"
                />
              </div>
            </div>
            <div className="settings-row">
              <div className="parameter-group">
                <label>Q diag:</label>
                <div className="q-matrix-inputs">
                  {matrixQ.map((value, index) => (
                    <input
                      key={`q-${index}`}
                      type="number"
                      step="0.1"
                      value={value}
                      onChange={(e) => {
                        const newQ = [...matrixQ];
                        newQ[index] = parseFloat(e.target.value);
                        setMatrixQ(newQ);
                      }}
                      className="q-input"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="parameter-group">
                <label>Grid Size:</label>
                <input
                  type="number"
                  step="any"
                  value={gridSize}
                  onChange={(e) => setGridSize(parseFloat(e.target.value))}
                  className="parameter-input"
                />
              </div>
              <button 
                onClick={() => {
                  analyzeEigenvalues();
                  analyzeLMI();
                }}
                className="analyze-button"
              >
                Analyze
              </button>
            </div>
          </div>
        </div>

        {/* LMI Analysis Results */}
        <div className="control-section">
          <h3>CCM-LMI Optimization</h3>
          <div className="equation-block">
            <div>minimize ρ</div>
            <div>subject to: H = A*W + W*transpose(A) - ρ*B*transpose(B) + 2λ*W ≺ 0</div>
            <div className="constraints">
              α<sub>min</sub>I ≼ W ≼ α<sub>max</sub>I, W = W<sup>T</sup> ≻ 0, ρ ≥ 0
            </div>
          </div>
          <div className="analysis-results">
            <div className="result-row">
              <span>H Eigenvalue Range:</span>
              <span>[{lmiAnalysis.minEigH.toFixed(4)}, {lmiAnalysis.maxEigH.toFixed(4)}]</span>
            </div>
            <div className="result-row">
              <span>W Eigenvalue Range:</span>
              <span>[{lmiAnalysis.minEigW.toFixed(4)}, {lmiAnalysis.maxEigW.toFixed(4)}]</span>
            </div>
            <div className="result-row">
              <span>ρ:</span>
              <span>{lmiAnalysis.rho.toFixed(4)}</span>
            </div>
            <div className="result-row">
              <span>LMI Feasible:</span>
              <span>{lmiAnalysis.feasible ? "Yes" : "No"}</span>
            </div>
            <div className="result-row">
              <span>Solver Status:</span>
              <span>{lmiAnalysis.solverInfo.status}</span>
            </div>
            <div className="result-row">
              <span>Solver:</span>
              <span>{lmiAnalysis.solverInfo.solverName}</span>
            </div>
            <div className="result-row">
              <span>Solve Time:</span>
              <span>{lmiAnalysis.solverInfo.solveTime?.toFixed(3) || 'N/A'} s</span>
            </div>
            <div className="result-row">
              <span>Decision Variables:</span>
              <span>{Math.floor(systemDimensions.n * (systemDimensions.n + 1) / 2) + 1}</span>
            </div>
            <div className="result-row">
              <span>Grid Points:</span>
              <span>{eigenAnalysis.gridPoints}</span>
            </div>
            {lmiAnalysis.constraintsViolation && (
              <div className="constraints-violation">
                <h4>Constraints Check:</h4>
                <div className={`violation-row ${lmiAnalysis.constraintsViolation.H_negative_definite ? 'satisfied' : 'violated'}`}>
                  <span>H ≺ 0:</span>
                  <span>{lmiAnalysis.constraintsViolation.H_negative_definite ? '✓' : '✗'}</span>
                </div>
                <div className={`violation-row ${lmiAnalysis.constraintsViolation.W_positive_definite ? 'satisfied' : 'violated'}`}>
                  <span>W ≻ 0:</span>
                  <span>{lmiAnalysis.constraintsViolation.W_positive_definite ? '✓' : '✗'}</span>
                </div>
                <div className={`violation-row ${lmiAnalysis.constraintsViolation.W_lower_bound ? 'satisfied' : 'violated'}`}>
                  <span>W ≽ α<sub>min</sub>I:</span>
                  <span>{lmiAnalysis.constraintsViolation.W_lower_bound ? '✓' : '✗'}</span>
                </div>
                <div className={`violation-row ${lmiAnalysis.constraintsViolation.W_upper_bound ? 'satisfied' : 'violated'}`}>
                  <span>W ≼ α<sub>max</sub>I:</span>
                  <span>{lmiAnalysis.constraintsViolation.W_upper_bound ? '✓' : '✗'}</span>
                </div>
                <div className={`violation-row ${lmiAnalysis.constraintsViolation.rho_positive ? 'satisfied' : 'violated'}`}>
                  <span>ρ ≥ 0:</span>
                  <span>{lmiAnalysis.constraintsViolation.rho_positive ? '✓' : '✗'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="simulation-panel">
        <h2>Simulation</h2>
        {/* Simulation content will go here */}
      </div>
    </div>
  )
}

export default App