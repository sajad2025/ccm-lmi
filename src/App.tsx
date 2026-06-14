import { useState, useEffect } from 'react';
import './App.css';
import { Switch } from '@headlessui/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as localSolver from './solver/localSolver';
import type { CCMResult } from './solver/sdpSolver';
import type {
  Signal,
  MatrixElement,
  JacobianElement,
  EigenvalueAnalysis,
  LMIAnalysis,
  SimulationData,
} from './types';
import { systemConfigs, DEFAULT_SYSTEM } from './systems';
import { computeJacobian, evaluateJacobianAtPoint, evaluateColumn, simulate } from './lib/dynamics';
import { analyzeEigenvalues } from './lib/eigenvalues';
import PendulumAnimation from './components/PendulumAnimation';
import CartPoleAnimation from './components/CartPoleAnimation';
import MatrixDisplay from './components/MatrixDisplay';

const STATE_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

function App() {
  const [systemDimensions, setSystemDimensions] = useState({ n: 4, m: 1 });

  const [states, setStates] = useState<Signal[]>(() => [
    { name: 'theta', min: -0.75, max: 0.75, ic: 0 },
    { name: 'eta', min: -0.5, max: 0.5, ic: 0 },
    { name: 'p', min: -0.2, max: 0.2, ic: 0 },
    { name: 'v', min: -1, max: 1, ic: 0 },
  ]);

  const [timeVector, setTimeVector] = useState({ duration: 10, sampleTime: 0.05 });

  const [matrixA, setMatrixA] = useState<MatrixElement[][]>(() => [
    [{ expression: 'eta*cos(theta)' }],
    [{ expression: 'eta^2*sin(theta)+tan(theta)' }],
    [{ expression: 'v' }],
    [{ expression: '0' }],
  ]);

  const [matrixB, setMatrixB] = useState<MatrixElement[][]>(() => [
    [{ expression: '0' }],
    [{ expression: '-1' }],
    [{ expression: '0' }],
    [{ expression: '1' }],
  ]);

  const [jacobianMatrix, setJacobianMatrix] = useState<JacobianElement[][]>(() =>
    Array.from({ length: systemDimensions.n }, () =>
      Array.from({ length: systemDimensions.n }, () => ({ expression: '' })),
    ),
  );

  const [gridSize, setGridSize] = useState(0.2);
  const [eigenAnalysis, setEigenAnalysis] = useState<EigenvalueAnalysis>({
    minRealEig: 0,
    maxRealEig: 0,
    minImagEig: 0,
    maxImagEig: 0,
    gridPoints: 0,
  });

  const [lmiParams, setLmiParams] = useState({ lambda: 0.1, alphaMin: 0.005, alphaMax: 5.0 });
  const [matrixQ, setMatrixQ] = useState<number[]>([1, 1, 10, 1]);

  const [lmiAnalysis, setLmiAnalysis] = useState<LMIAnalysis>({
    minEigH: null,
    maxEigH: null,
    minEigD: null,
    maxEigD: null,
    feasible: false,
    W: Array.from({ length: 4 }, () => Array(4).fill(0)),
    M: Array.from({ length: 4 }, () => Array(4).fill(0)),
    rho: 0,
    minEigW: 0,
    maxEigW: 0,
    minEigM: 0,
    maxEigM: 0,
    solverInfo: { solverName: '', setupTime: null, solveTime: null, status: '', optimalValue: null },
    constraintsViolation: null,
  });

  const [simulationMode, setSimulationMode] = useState<'open-loop' | 'closed-loop'>('open-loop');
  const [simulationData, setSimulationData] = useState<SimulationData>({ points: [], isRunning: false });
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [useDConstraint, setUseDConstraint] = useState(false);
  const [solverStatus, setSolverStatus] = useState<string | null>(null);

  const getValidSignalCount = (n: number) => (isNaN(n) || n <= 0 || n > 4 ? 1 : n);
  const getValidDimension = (value: number) => (isNaN(value) || value < 1 ? 1 : value);

  const loadSystemConfig = (configKey: string) => {
    const config = systemConfigs[configKey];
    if (!config) return;

    setSimulationData({ points: [], isRunning: false });
    setSimulationError(null);
    setSimulationMode('open-loop');
    setUseDConstraint(configKey === 'under-actuated-cartpole'); // cart-pole uses D ⪰ 0
    setSystemDimensions({ n: config.n, m: config.m });

    const newStates = Array.from({ length: config.n }, (_, i) =>
      i < config.states.length ? config.states[i] : { name: '', min: -0.1, max: 0.1, ic: 0 },
    );
    setStates(newStates);

    const newMatrixA = Array.from({ length: config.n }, () => [{ expression: '0' }]);
    const newMatrixB = Array.from({ length: config.n }, () =>
      Array.from({ length: config.m }, () => ({ expression: '0' })),
    );
    config.matrixA.forEach((row, i) => {
      if (i < newMatrixA.length) newMatrixA[i] = [...row];
    });
    config.matrixB.forEach((row, i) => {
      if (i < newMatrixB.length) newMatrixB[i] = [...row];
    });

    setMatrixA(newMatrixA);
    setMatrixB(newMatrixB);
    setLmiParams(config.lmiParams);
    setMatrixQ(config.matrixQ);
  };

  // Recompute the symbolic Jacobian whenever f, the state names, or n change.
  useEffect(() => {
    setJacobianMatrix(computeJacobian(matrixA, states.map((s) => s.name), systemDimensions.n));
  }, [matrixA, states, systemDimensions.n]);

  // Load the default system once on mount.
  useEffect(() => {
    loadSystemConfig(DEFAULT_SYSTEM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStateChange = (index: number, field: keyof Signal, value: string | number) => {
    const newStates = [...states];
    newStates[index] = { ...newStates[index], [field]: value };
    setStates(newStates);
  };

  const handleDimensionChange = (field: 'n' | 'm', value: number) => {
    const validValue = getValidDimension(value);
    setSystemDimensions((prev) => ({ ...prev, [field]: validValue }));

    if (field === 'n') {
      setStates((prevStates) => {
        const validCount = getValidSignalCount(validValue);
        return Array.from({ length: validCount }, (_, i) =>
          i < prevStates.length ? prevStates[i] : { name: '', min: 0, max: 1, ic: 0 },
        );
      });
      setMatrixA(Array.from({ length: validValue }, () => [{ expression: '0' }]));
      setMatrixB(
        Array.from({ length: validValue }, () =>
          Array.from({ length: systemDimensions.m }, () => ({ expression: '0' })),
        ),
      );
      setMatrixQ(Array(validValue).fill(1));
    } else {
      setMatrixB(
        Array.from({ length: systemDimensions.n }, () =>
          Array.from({ length: validValue }, () => ({ expression: '0' })),
        ),
      );
    }
  };

  const handleMatrixChange = (matrix: 'A' | 'B', row: number, col: number, value: string) => {
    if (matrix === 'A') {
      const next = [...matrixA];
      next[row][col] = { expression: value };
      setMatrixA(next);
    } else {
      const next = [...matrixB];
      next[row][col] = { expression: value };
      setMatrixB(next);
    }
  };

  const handleTimeVectorChange = (field: 'duration' | 'sampleTime', value: number) => {
    setTimeVector((prev) => ({ ...prev, [field]: value }));
  };

  const canEnableClosedLoop = () => lmiAnalysis.feasible && lmiAnalysis.W && lmiAnalysis.W.length > 0;

  const analyzeLMI = async () => {
    const n = systemDimensions.n;
    try {
      // Linearize at the midpoint of each state's range.
      const stateValues: Record<string, number> = {};
      states.forEach((state, i) => {
        stateValues[state.name || `x${i + 1}`] = (state.max + state.min) / 2;
      });

      const A = evaluateJacobianAtPoint(jacobianMatrix, stateValues, n);
      const B = evaluateColumn(matrixB, stateValues).map((v) => [v]); // column vector

      setSolverStatus('Solving…');
      const result: CCMResult = await localSolver.solveLMI({
        state_values: stateValues,
        matrix_a: A,
        matrix_b: B,
        matrix_q: matrixQ,
        alpha_min: lmiParams.alphaMin,
        alpha_max: lmiParams.alphaMax,
        lambda_val: lmiParams.lambda,
        n,
        use_d_constraint: useDConstraint,
      });
      setSolverStatus(null);

      setLmiAnalysis({
        minEigH: result.min_eig_h,
        maxEigH: result.max_eig_h,
        minEigD: result.min_eig_d,
        maxEigD: result.max_eig_d,
        feasible: result.feasible,
        W: result.W || Array.from({ length: n }, () => Array(n).fill(0)),
        M: result.M || Array.from({ length: n }, () => Array(n).fill(0)),
        rho: result.rho,
        minEigW: result.min_eig_w,
        maxEigW: result.max_eig_w,
        minEigM: result.min_eig_m,
        maxEigM: result.max_eig_m,
        solverInfo: {
          solverName: result.solver_info.solver_name || '',
          setupTime: result.solver_info.setup_time || null,
          solveTime: result.solver_info.solve_time || (result.solver_info.status === 'optimal' ? 0.001 : null),
          status: result.solver_info.status || 'error',
          optimalValue: result.solver_info.optimal_value || null,
        },
        constraintsViolation: result.constraints_violation,
      });
    } catch (error) {
      console.error('Error in LMI analysis:', error);
      setSolverStatus(null);
      setLmiAnalysis((prev) => ({
        ...prev,
        feasible: false,
        W: Array.from({ length: n }, () => Array(n).fill(0)),
        M: Array.from({ length: n }, () => Array(n).fill(0)),
        rho: 0,
        solverInfo: { solverName: '', setupTime: null, solveTime: null, status: 'error', optimalValue: null },
        constraintsViolation: null,
      }));
    }
  };

  const handleAnalyze = () => {
    setEigenAnalysis(analyzeEigenvalues(states, jacobianMatrix, systemDimensions.n, gridSize));
    analyzeLMI();
  };

  const runSimulation = () => {
    if (simulationData.isRunning) return;
    setSimulationError(null);

    if (timeVector.duration <= 0 || timeVector.sampleTime <= 0) {
      setSimulationError('Duration and sample time must be positive numbers');
      return;
    }
    if (timeVector.sampleTime >= timeVector.duration) {
      setSimulationError('Sample time must be smaller than duration');
      return;
    }
    if (simulationMode === 'closed-loop' && (!lmiAnalysis.W || !lmiAnalysis.rho)) {
      setSimulationError('Cannot run closed-loop simulation without valid LMI solution');
      return;
    }

    setSimulationData((prev) => ({ ...prev, isRunning: true }));
    try {
      const control = simulationMode === 'closed-loop' ? { W: lmiAnalysis.W, rho: lmiAnalysis.rho } : null;
      const points = simulate({
        states,
        fExpressions: matrixA,
        matrixB,
        duration: timeVector.duration,
        sampleTime: timeVector.sampleTime,
        control,
      });
      setSimulationData({ points, isRunning: false });
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : 'An error occurred during simulation');
      setSimulationData((prev) => ({ ...prev, isRunning: false, points: [] }));
    }
  };

  const isCartPole = states.length === 4 && states[2]?.name === 'p';
  const isPendulum = !!systemConfigs[DEFAULT_SYSTEM] && systemConfigs[DEFAULT_SYSTEM].states[0].name === states[0]?.name;
  const xAxisTicks = Array.from({ length: Math.floor(timeVector.duration / 2) + 1 }, (_, i) => i * 2);

  return (
    <div className="app-container">
      <div className="controls-panel">
        <h2>State Space</h2>

        {/* System selection */}
        <div className="control-section">
          <div className="system-selector">
            <label>System:</label>
            <select
              onChange={(e) => loadSystemConfig(e.target.value)}
              className="system-select"
              defaultValue={DEFAULT_SYSTEM}
            >
              {Object.entries(systemConfigs).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Time vector */}
        <div className="control-section">
          <div className="time-vector-controls">
            <h3>Time (s)</h3>
            <div className="time-input-group">
              <label>Duration:</label>
              <input
                type="number"
                value={timeVector.duration}
                onChange={(e) => handleTimeVectorChange('duration', Math.max(0, parseFloat(e.target.value)))}
                min="0"
                step="5"
                className="time-input"
              />
            </div>
            <div className="time-input-group">
              <label>Sample:</label>
              <input
                type="number"
                value={timeVector.sampleTime}
                onChange={(e) => handleTimeVectorChange('sampleTime', Math.max(0.01, parseFloat(e.target.value)))}
                min="0.01"
                step="0.05"
                className="time-input"
              />
            </div>
          </div>
        </div>

        {/* Dimensions */}
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

        {/* States */}
        <div className="control-section">
          <h3>States</h3>
          <div className="states-grid">
            <div className="state-header">
              <span>Name</span>
              <span>Min</span>
              <span>Max</span>
              <span>I.C.</span>
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
                <input
                  type="number"
                  step="0.1"
                  value={state.ic}
                  onChange={(e) => handleStateChange(index, 'ic', parseFloat(e.target.value))}
                  className="state-input"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dynamics matrices */}
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
                        placeholder={`f${i + 1}`}
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
                        placeholder={`B${i + 1}${j + 1}`}
                        className="matrix-input"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Symbolic Jacobian */}
        <div className="control-section">
          <h3>A ({systemDimensions.n}×{systemDimensions.n} Jacobian)</h3>
          <div className="matrix-grid">
            {jacobianMatrix.map((row, i) => (
              <div key={`jacobian-row-${i}`} className="matrix-row">
                {row.map((cell, j) => (
                  <div key={`jacobian-${i}-${j}`} className="jacobian-cell" title={`∂f${i + 1}/∂x${j + 1}`}>
                    {cell.expression || `∂f${i + 1}/∂x${j + 1}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="analysis-panel">
        <h2>Analysis</h2>

        {/* Analysis settings */}
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
                  onChange={(e) => setLmiParams({ ...lmiParams, lambda: parseFloat(e.target.value) })}
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
                  onChange={(e) => setLmiParams({ ...lmiParams, alphaMin: parseFloat(e.target.value) })}
                  className="parameter-input"
                />
              </div>
              <div className="parameter-group">
                <label>α max:</label>
                <input
                  type="number"
                  step="0.01"
                  value={lmiParams.alphaMax}
                  onChange={(e) => setLmiParams({ ...lmiParams, alphaMax: parseFloat(e.target.value) })}
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
              <button onClick={handleAnalyze} className="analyze-button" disabled={solverStatus !== null}>
                {solverStatus !== null ? 'Working…' : 'Analyze'}
              </button>
            </div>
            {solverStatus && <div className="solver-status">{solverStatus}</div>}
          </div>
        </div>

        {/* CCM-LMI results */}
        <div className="control-section">
          <h3>CCM-LMI Optimization</h3>
          <div className="equation-block">
            <div>minimize ρ</div>
            <div>
              s.t.{' '}
              {useDConstraint ? (
                <>
                  D = [-W*A<sup>T</sup> - A*W + ρBB<sup>T</sup>, W*L<sup>T</sup>; L*W, I] ≽ 0
                </>
              ) : (
                <>
                  H = A*W + W*A<sup>T</sup> - ρBB<sup>T</sup> + 2λW ≺ 0
                </>
              )}
            </div>
            <div className="constraints">
              α<sub>min</sub>I ≼ W ≼ α<sub>max</sub>I, W = W<sup>T</sup> ≻ 0, ρ ≥ 0
            </div>
          </div>
          <div className="settings-row">
            <div className="parameter-group">
              <label>Constraint Type:</label>
              <div className="radio-group">
                <label>
                  <input type="radio" checked={!useDConstraint} onChange={() => setUseDConstraint(false)} />
                  H ≺ 0
                </label>
                <label>
                  <input type="radio" checked={useDConstraint} onChange={() => setUseDConstraint(true)} />
                  D ≽ 0
                </label>
              </div>
            </div>
          </div>
          <div className="analysis-results">
            <div className="result-row">
              <span>{useDConstraint ? 'D Eigenvalue Range:' : 'H Eigenvalue Range:'}</span>
              <span>
                {useDConstraint
                  ? `[${lmiAnalysis.minEigD?.toFixed(4) || 'N/A'}, ${lmiAnalysis.maxEigD?.toFixed(4) || 'N/A'}]`
                  : `[${lmiAnalysis.minEigH?.toFixed(4) || 'N/A'}, ${lmiAnalysis.maxEigH?.toFixed(4) || 'N/A'}]`}
              </span>
            </div>
            <div className="result-row">
              <span>W Eigenvalue Range:</span>
              <span>
                [{lmiAnalysis.minEigW.toFixed(4)}, {lmiAnalysis.maxEigW.toFixed(4)}]
              </span>
            </div>
            <div className="result-row">
              <span>ρ:</span>
              <span>{lmiAnalysis.rho.toFixed(4)}</span>
            </div>
            {lmiAnalysis.constraintsViolation && (
              <div className="constraints-violation">
                <h4>Constraints Check:</h4>
                <div className="constraints-grid">
                  <div className="constraints-column">
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
                  </div>
                  <div className="constraints-column">
                    {useDConstraint ? (
                      <div className={`violation-row ${lmiAnalysis.constraintsViolation.D_positive_semidefinite ? 'satisfied' : 'violated'}`}>
                        <span>D ≽ 0:</span>
                        <span>{lmiAnalysis.constraintsViolation.D_positive_semidefinite ? '✓' : '✗'}</span>
                      </div>
                    ) : (
                      <div className={`violation-row ${lmiAnalysis.constraintsViolation.H_negative_definite ? 'satisfied' : 'violated'}`}>
                        <span>H ≺ 0:</span>
                        <span>{lmiAnalysis.constraintsViolation.H_negative_definite ? '✓' : '✗'}</span>
                      </div>
                    )}
                    <div className={`violation-row ${lmiAnalysis.constraintsViolation.rho_positive ? 'satisfied' : 'violated'}`}>
                      <span>ρ ≥ 0:</span>
                      <span>{lmiAnalysis.constraintsViolation.rho_positive ? '✓' : '✗'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {lmiAnalysis.feasible && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ marginBottom: '8px' }}>Riemannian Metric M = W⁻¹:</h4>
                <MatrixDisplay matrix={lmiAnalysis.M} />
                <div style={{ marginTop: '16px', fontSize: '14px', color: '#666' }}>
                  <h4 style={{ marginBottom: '8px' }}>Solver Information:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>Solver: {lmiAnalysis.solverInfo.solverName}</div>
                    <div>Status: {lmiAnalysis.solverInfo.status}</div>
                    <div>Setup Time: {lmiAnalysis.solverInfo.setupTime?.toFixed(3) || 'N/A'} s</div>
                    <div>Solve Time: {lmiAnalysis.solverInfo.solveTime?.toFixed(3) || 'N/A'} s</div>
                    <div>Optimal Value: {lmiAnalysis.solverInfo.optimalValue?.toFixed(6) || 'N/A'}</div>
                    <div>Grid Points: {eigenAnalysis.gridPoints}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="simulation-panel">
        <h2>Simulation</h2>
        <div className="control-section">
          <div className="simulation-controls">
            <div className="simulation-mode-selector">
              <label className="mode-label">Mode:</label>
              <div className="simulation-controls-row">
                <div className="mode-switch-container">
                  <span className={`mode-text ${simulationMode === 'open-loop' ? 'active' : ''}`}>Open-Loop</span>
                  <Switch
                    checked={simulationMode === 'closed-loop'}
                    onChange={(checked: boolean) => setSimulationMode(checked ? 'closed-loop' : 'open-loop')}
                    disabled={!canEnableClosedLoop()}
                    className={`switch-base ${canEnableClosedLoop() ? 'switch-enabled' : 'switch-disabled'}`}
                  >
                    <span className={`switch-handle ${simulationMode === 'closed-loop' ? 'switch-handle-active' : ''}`} />
                  </Switch>
                  <span className={`mode-text ${simulationMode === 'closed-loop' ? 'active' : ''}`}>Closed-Loop</span>
                </div>
                <button onClick={runSimulation} disabled={simulationData.isRunning} className="simulate-button">
                  {simulationData.isRunning ? 'Simulating...' : 'Run Simulation'}
                </button>
              </div>
              {!canEnableClosedLoop() && (
                <div className="mode-hint">Run CCM-LMI analysis first to enable closed-loop simulation</div>
              )}
              {simulationMode === 'closed-loop' && (
                <div className="equation-block" style={{ marginTop: '16px', fontSize: '0.9em' }}>
                  {isCartPole ? (
                    <div>
                      u = -0.5ρ · B<sup>T</sup>W<sup>-1</sup>(x - [0;0;0;0])
                    </div>
                  ) : (
                    <div>
                      u = -0.5ρ · B<sup>T</sup>W<sup>-1</sup>(x - [π;0])
                    </div>
                  )}
                </div>
              )}
            </div>

            {simulationData.points.length > 0 && (
              <div className="simulation-plot">
                {isCartPole ? (
                  <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>Cart-Pole Animation</h3>
                    <CartPoleAnimation simulationData={simulationData.points} duration={timeVector.duration} width={450} height={200} />
                  </div>
                ) : (
                  isPendulum && (
                    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <h3 style={{ margin: '0 0 10px 0' }}>Pendulum Animation</h3>
                      <PendulumAnimation simulationData={simulationData.points} duration={timeVector.duration} width={180} height={180} />
                    </div>
                  )
                )}

                {/* States */}
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={simulationData.points} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" ticks={xAxisTicks} tickCount={xAxisTicks.length} />
                    <YAxis />
                    <Tooltip />
                    <Legend
                      layout="horizontal"
                      align="right"
                      verticalAlign="top"
                      wrapperStyle={{ paddingLeft: '10px', paddingTop: '10px', backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '4px' }}
                    />
                    {states.map((state, idx) => (
                      <Line
                        key={`state-${idx}`}
                        type="monotone"
                        dataKey={`states[${idx}]`}
                        stroke={STATE_COLORS[idx]}
                        name={state.name || `x${idx + 1}`}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Control input */}
                {simulationMode === 'closed-loop' && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={simulationData.points} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" label={{ value: 'Time (s)', position: 'bottom' }} ticks={xAxisTicks} tickCount={xAxisTicks.length} />
                      <YAxis />
                      <Tooltip />
                      <Legend
                        layout="horizontal"
                        align="right"
                        verticalAlign="top"
                        wrapperStyle={{ paddingLeft: '10px', paddingTop: '10px', backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '4px' }}
                      />
                      <Line type="monotone" dataKey="u" stroke="#ff7300" name="control input" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {simulationError && <div className="simulation-error">{simulationError}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
