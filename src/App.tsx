import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css'
import * as math from 'mathjs';
import axios from 'axios';
import { Switch } from '@headlessui/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface Signal {
  name: string;
  min: number;
  max: number;
  ic: number;
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
  minEigH: number | null;
  maxEigH: number | null;
  minEigD: number | null;
  maxEigD: number | null;
  feasible: boolean;
  W: number[][];
  M: number[][];
  rho: number;
  minEigW: number;
  maxEigW: number;
  minEigM: number;
  maxEigM: number;
  solverInfo: {
    solverName: string;
    setupTime: number | null;
    solveTime: number | null;
    status: string;
    optimalValue: number | null;
  };
  constraintsViolation: {
    H_negative_definite: boolean | null;
    D_positive_semidefinite: boolean | null;
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

interface SimulationPoint {
  t: number;
  states: number[];
  u: number;
}

interface SimulationData {
  points: SimulationPoint[];
  isRunning: boolean;
}

// Add PendulumAnimation component
const PendulumAnimation: React.FC<{
  simulationData: SimulationPoint[];
  duration: number;
  width: number;
  height: number;
}> = ({ simulationData, duration, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const getInterpolatedTheta = useCallback((time: number) => {
    const normalizedTime = time % duration;
    const dt = simulationData[1].t - simulationData[0].t;
    const index = Math.floor(normalizedTime / dt);
    const nextIndex = Math.min(index + 1, simulationData.length - 1);
    
    if (index >= simulationData.length - 1) return simulationData[simulationData.length - 1].states[0];
    
    const t0 = index * dt;
    const t1 = nextIndex * dt;
    const alpha = (normalizedTime - t0) / (t1 - t0);
    
    return simulationData[index].states[0] * (1 - alpha) + simulationData[nextIndex].states[0] * alpha;
  }, [duration, simulationData]);

  const animate = useCallback((timestamp: number) => {
    if (!isPlaying) return;
    
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      lastTimeRef.current = timestamp;
    }

    const deltaTime = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;
    
    setCurrentTime(prev => {
      const newTime = prev + deltaTime;
      if (newTime >= duration) {
        setIsPlaying(false);
        return duration;
      }
      return newTime;
    });
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set origin to center of canvas
    const centerX = width / 2;
    const centerY = height / 2;

    // Pendulum parameters
    const length = Math.min(width, height) * 0.4;
    const bobRadius = 10;

    // Calculate pendulum end point
    // theta=0 means pointing down, positive theta rotates counterclockwise
    const theta = getInterpolatedTheta(currentTime);
    const angle = Math.PI/2 + theta;  // Start from downward position (PI/2) and add theta
    const endX = centerX + length * Math.cos(angle);
    const endY = centerY + length * Math.sin(angle);

    // Draw pivot point
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Draw rod
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw bob
    ctx.beginPath();
    ctx.arc(endX, endY, bobRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#357abd';
    ctx.lineWidth = 2;
    ctx.stroke();

  }, [currentTime, width, height, getInterpolatedTheta]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentTime(0);
    startTimeRef.current = 0;
    lastTimeRef.current = 0;
    setIsPlaying(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ 
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #eee'
        }}
      />
      <div style={{ 
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '10px',
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '4px 8px',
        borderRadius: '4px'
      }}>
        <button
          onClick={handlePlayPause}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

// Add CartPoleAnimation component
const CartPoleAnimation: React.FC<{
  simulationData: SimulationPoint[];
  duration: number;
  width: number;
  height: number;
}> = ({ simulationData, duration, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const startTimeRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Reset animation when simulation data changes
  useEffect(() => {
    handleReset();
  }, [simulationData]);

  const getInterpolatedState = useCallback((time: number) => {
    if (!simulationData || simulationData.length < 2) return simulationData[0]?.states || [];
    
    const normalizedTime = time % duration;
    const dt = simulationData[1].t - simulationData[0].t;
    const index = Math.floor(normalizedTime / dt);
    const nextIndex = Math.min(index + 1, simulationData.length - 1);
    
    if (index >= simulationData.length - 1) return simulationData[simulationData.length - 1].states;
    
    const t0 = index * dt;
    const t1 = nextIndex * dt;
    const alpha = (normalizedTime - t0) / (t1 - t0);
    
    return simulationData[index].states.map((val, i) => 
      val * (1 - alpha) + simulationData[nextIndex].states[i] * alpha
    );
  }, [duration, simulationData]);

  const animate = useCallback((timestamp: number) => {
    if (!isPlaying) return;
    
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
      lastTimeRef.current = timestamp;
    }

    const deltaTime = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;
    
    setCurrentTime(prev => {
      const newTime = prev + deltaTime;
      if (newTime >= duration) {
        setIsPlaying(false);
        return duration;
      }
      return newTime;
    });
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get current state
    const state = getInterpolatedState(currentTime);
    if (!state.length) return;  // Don't render if no state available

    const theta = state[0];  // Angle from vertical (north)
    const p = state[2];      // Cart position

    // Cart parameters
    const cartWidth = 40;
    const cartHeight = 20;
    const poleLength = Math.min(width, height) * 0.3;
    const bobRadius = 6;

    // Scale cart position to canvas
    const scale = (width - cartWidth) / 2;  // Use half the canvas width as scale
    const cartX = width/2 + p * scale;  // Center position + scaled displacement
    const cartY = height * 0.7;  // Place cart at 70% of height

    // Draw cart
    ctx.fillStyle = '#666';
    ctx.fillRect(cartX - cartWidth/2, cartY - cartHeight/2, cartWidth, cartHeight);

    // Calculate pole end point
    // theta=0 means pointing up, positive theta rotates clockwise
    const poleX = cartX + poleLength * Math.sin(theta);
    const poleY = cartY - poleLength * Math.cos(theta);

    // Draw pole
    ctx.beginPath();
    ctx.moveTo(cartX, cartY);
    ctx.lineTo(poleX, poleY);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw bob at pole end
    ctx.beginPath();
    ctx.arc(poleX, poleY, bobRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#357abd';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw ground line
    ctx.beginPath();
    ctx.moveTo(0, cartY + cartHeight/2 + 1);
    ctx.lineTo(width, cartY + cartHeight/2 + 1);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.stroke();

  }, [currentTime, width, height, getInterpolatedState]);

  const handlePlayPause = () => {
    if (!simulationData || simulationData.length < 2) return;
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setCurrentTime(0);
    startTimeRef.current = 0;
    lastTimeRef.current = 0;
    setIsPlaying(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ 
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #eee'
        }}
      />
      <div style={{ 
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '10px',
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '4px 8px',
        borderRadius: '4px'
      }}>
        <button
          onClick={handlePlayPause}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

// Add this component near the top of the file, after other component imports
const MatrixDisplay: React.FC<{
  matrix: number[][];
  title?: string;
}> = ({ matrix, title }) => {
  if (!matrix || matrix.length === 0) return null;

  return (
    <div className="matrix-display">
      {title && <div className="matrix-display-title">{title}</div>}
      <div className="matrix-container">
        <div>
          {matrix.map((row, i) => (
            <div key={i} className="matrix-row">
              {row.map((element, j) => (
                <div key={j} className="matrix-element">
                  {element.toFixed(1)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function App() {
  const systemConfigs: Record<string, SystemConfig> = {
    'empty': {
      name: 'Empty System',
      n: 1,
      m: 1,
      states: [
        { name: '', min: -0.1, max: 0.1, ic: 0 }
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
        { name: 'theta', min: 2.9, max: 3.3, ic: 2.9 },
        { name: 'omega', min: -0.5, max: 0.5, ic: 0 }
      ],
      matrixA: [
        [{ expression: 'omega' }],
        [{ expression: '-10*sin(theta)-0.1*omega' }]
      ],
      matrixB: [
        [{ expression: '0' }],
        [{ expression: '1' }]
      ],
      lmiParams: {
        lambda: 1,
        alphaMin: 0.1,
        alphaMax: 5.0
      },
      matrixQ: [0, 0]
    },
    'under-actuated-cartpole': {
      name: 'Under-Actuated Cart-Pole',
      n: 4,
      m: 1,
      states: [
        { name: 'theta', min: -0.75, max: 0.75, ic: 0.1 },
        { name: 'eta', min: -0.5, max: 0.5, ic: 0 },
        { name: 'p', min: -0.2, max: 0.2, ic: 0 },
        { name: 'v', min: -1, max: 1, ic: 0 }
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

    // Reset simulation data and plots
    setSimulationData({
      points: [],
      isRunning: false
    });
    setSimulationError(null);
    setSimulationMode('open-loop');

    // Set constraint type based on system
    setUseDConstraint(false);  // Use H < 0 for all systems by default

    // First update dimensions to match the config
    setSystemDimensions({ n: config.n, m: config.m });
    
    // Reset states array to match config
    const newStates = Array(config.n).fill(null).map((_, i) => 
      i < config.states.length ? config.states[i] : { name: '', min: -0.1, max: 0.1, ic: 0 }
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
    { name: 'theta', min: -0.75, max: 0.75, ic: 0 },
    { name: 'eta', min: -0.5, max: 0.5, ic: 0 },
    { name: 'p', min: -0.2, max: 0.2, ic: 0 },
    { name: 'v', min: -1, max: 1, ic: 0 }
  ]);

  const [timeVector, setTimeVector] = useState({
    duration: 10,
    sampleTime: 0.05
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
    minEigH: null,
    maxEigH: null,
    minEigD: null,
    maxEigD: null,
    feasible: false,
    W: Array(4).fill(0).map(() => Array(4).fill(0)),
    M: Array(4).fill(0).map(() => Array(4).fill(0)),
    rho: 0,
    minEigW: 0,
    maxEigW: 0,
    minEigM: 0,
    maxEigM: 0,
    solverInfo: {
      solverName: '',
      setupTime: null,
      solveTime: null,
      status: '',
      optimalValue: null
    },
    constraintsViolation: null
  });

  const [simulationMode, setSimulationMode] = useState<'open-loop' | 'closed-loop'>('open-loop');

  const [simulationData, setSimulationData] = useState<SimulationData>({
    points: [],
    isRunning: false
  });

  // Add this state for simulation errors
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Add this state variable near other state declarations
  const [useDConstraint, setUseDConstraint] = useState(false);

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
    loadSystemConfig('fully-actuated-pendulum');
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
          i < prevStates.length ? prevStates[i] : { name: '', min: 0, max: 1, ic: 0 }
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
      
      // Evaluate B matrix at the current state
      const B = matrixB.map(row => {
        try {
          const result = math.evaluate(row[0].expression, stateValues);
          return [Number(result)];  // Keep as column vector
        } catch (error) {
          console.error('Error evaluating B matrix element:', row[0].expression, error);
          return [0];
        }
      });

      console.log('LMI Analysis - Matrices:', { A, B });

      // Make API request to solve LMI
      const response = await axios.post('http://localhost:8000/solve-lmi', {
        state_values: stateValues,
        matrix_a: A,
        matrix_b: B,
        matrix_q: matrixQ,
        alpha_min: lmiParams.alphaMin,
        alpha_max: lmiParams.alphaMax,
        lambda_val: lmiParams.lambda,
        n: systemDimensions.n,
        use_d_constraint: useDConstraint
      });

      const result = response.data;
      
      setLmiAnalysis({
        minEigH: result.min_eig_h,
        maxEigH: result.max_eig_h,
        minEigD: result.min_eig_d,
        maxEigD: result.max_eig_d,
        feasible: result.feasible,
        W: result.W || Array(n).fill(0).map(() => Array(n).fill(0)),
        M: result.M || Array(n).fill(0).map(() => Array(n).fill(0)),
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
          optimalValue: result.solver_info.optimal_value || null
        },
        constraintsViolation: result.constraints_violation
      });

    } catch (error) {
      console.error('Error in LMI analysis:', error);
      setLmiAnalysis({
        minEigH: null,
        maxEigH: null,
        minEigD: null,
        maxEigD: null,
        feasible: false,
        W: Array(n).fill(0).map(() => Array(n).fill(0)),
        M: Array(n).fill(0).map(() => Array(n).fill(0)),
        rho: 0,
        minEigW: 0,
        maxEigW: 0,
        minEigM: 0,
        maxEigM: 0,
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

  const canEnableClosedLoop = () => {
    return lmiAnalysis.feasible && lmiAnalysis.W && lmiAnalysis.W.length > 0;
  };

  const evaluateStateDerivative = (t: number, state: number[], expressions: MatrixElement[][], includeControl: boolean = false): number[] => {
    const stateObj: Record<string, number> = {};
    states.forEach((s, i) => {
      const name = s.name || `x${i+1}`;
      stateObj[name] = state[i];
    });

    // Calculate open-loop dynamics
    const openLoopDynamics = expressions.map(row => {
      try {
        const result = math.evaluate(row[0].expression, stateObj);
        return Number(result);
      } catch (error) {
        console.error('Error evaluating expression:', row[0].expression, error);
        return 0;
      }
    });

    // If in closed-loop mode, add Bu term
    if (includeControl && simulationMode === 'closed-loop') {
      const u = calculateControlInput(state);
      // Evaluate B matrix with current state values
      const B = matrixB.map(row => {
        try {
          const result = math.evaluate(row[0].expression, stateObj);
          return Number(result);
        } catch (error) {
          console.error('Error evaluating B matrix element:', row[0].expression, error);
          return 0;
        }
      });
      const Bu = B.map(b => b * u);
      return openLoopDynamics.map((f, i) => f + Bu[i]);
    }

    return openLoopDynamics;
  };

  const calculateControlInput = (state: number[]): number => {
    if (!lmiAnalysis.W || !lmiAnalysis.rho) return 0;
    
    try {
      // Create state object for evaluating expressions
      const stateObj: Record<string, number> = {};
      states.forEach((s, i) => {
        const name = s.name || `x${i+1}`;
        stateObj[name] = state[i];
      });

      // Evaluate B matrix at current state
      const B = matrixB.map(row => {
        try {
          const result = math.evaluate(row[0].expression, stateObj);
          return Number(result);
        } catch (error) {
          console.error('Error evaluating B matrix element:', row[0].expression, error);
          return 0;
        }
      });

      // Convert arrays to mathjs matrices for proper matrix operations
      const B_matrix = math.matrix(B);  // n×1 matrix
      
      // Create error state vector based on the system type
      const error_state = [...state];
      const isCartPole = states.length === 4 && states[2]?.name === 'p';
      
      if (isCartPole) {
        // For cart-pole: error relative to [0,0,0,0]
        error_state[0] = state[0] - 0;  // theta
        error_state[1] = state[1] - 0;  // eta
        error_state[2] = state[2] - 0;  // p
        error_state[3] = state[3] - 0;  // v
      } else {
        // For inverted pendulum: error relative to [π,0]
        error_state[0] = state[0] - Math.PI;  // theta
        error_state[1] = state[1] - 0;        // omega
      }
      
      const error_state_matrix = math.matrix(error_state);  // n×1 matrix
      const W_matrix = math.matrix(lmiAnalysis.W);  // n×n matrix
      
      // Calculate W^(-1)
      const W_inv = math.inv(W_matrix);
      
      // Calculate W^(-1) * error first (n×n * n×1 = n×1)
      const W_inv_error = math.multiply(W_inv, error_state_matrix);
      
      // Calculate final control: u = -0.5 * rho * B^T * W^(-1) * error
      const B_transpose = math.transpose(B_matrix);
      const u = -0.5 * lmiAnalysis.rho * math.multiply(B_transpose, W_inv_error);
      
      console.log('Control calculation details:', {
        state_vector: state,
        error_state: error_state,
        B_vector: B,
        W_matrix: lmiAnalysis.W,
        W_inverse: W_inv.valueOf(),
        W_inv_error: W_inv_error,
        rho: lmiAnalysis.rho,
        control_value: u
      });
      
      return Number(u);
    } catch (error) {
      console.error('Error calculating control input:', error);
      return 0;
    }
  };

  const rk4Step = (
    t: number,
    state: number[],
    dt: number,
    expressions: MatrixElement[][],
    includeControl: boolean = false
  ): number[] => {
    const k1 = evaluateStateDerivative(t, state, expressions, includeControl);
    
    const k2State = state.map((x, i) => x + k1[i] * dt / 2);
    const k2 = evaluateStateDerivative(t + dt/2, k2State, expressions, includeControl);
    
    const k3State = state.map((x, i) => x + k2[i] * dt / 2);
    const k3 = evaluateStateDerivative(t + dt/2, k3State, expressions, includeControl);
    
    const k4State = state.map((x, i) => x + k3[i] * dt);
    const k4 = evaluateStateDerivative(t + dt, k4State, expressions, includeControl);
    
    return state.map((x, i) => 
      x + (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i])
    );
  };

  const runSimulation = () => {
    if (simulationData.isRunning) return;
    
    // Clear previous error
    setSimulationError(null);
    
    // Validate time settings
    if (timeVector.duration <= 0 || timeVector.sampleTime <= 0) {
      setSimulationError("Duration and sample time must be positive numbers");
      return;
    }
    
    if (timeVector.sampleTime >= timeVector.duration) {
      setSimulationError("Sample time must be smaller than duration");
      return;
    }

    // Additional validation for closed-loop mode
    if (simulationMode === 'closed-loop' && (!lmiAnalysis.W || !lmiAnalysis.rho)) {
      setSimulationError("Cannot run closed-loop simulation without valid LMI solution");
      return;
    }
    
    setSimulationData(prev => ({ ...prev, isRunning: true }));
    
    try {
      // Get initial conditions
      const initialState = states.map(s => s.ic);
      const dt = timeVector.sampleTime;
      const duration = timeVector.duration;
      const numSteps = Math.floor(duration / dt);
      
      // Initialize simulation data
      let currentState = [...initialState];
      const initialU = simulationMode === 'closed-loop' ? calculateControlInput(currentState) : 0;
      const points: SimulationPoint[] = [{
        t: 0,
        states: [...currentState],
        u: initialU
      }];
      
      // Run simulation
      for (let step = 1; step <= numSteps; step++) {
        const t = step * dt;
        currentState = rk4Step(t, currentState, dt, matrixA, simulationMode === 'closed-loop');
        
        // Check for NaN or Infinity
        if (currentState.some(x => isNaN(x) || !isFinite(x))) {
          throw new Error("Simulation produced invalid values. The system might be unstable.");
        }
        
        // Calculate control input for this step
        const u = simulationMode === 'closed-loop' ? calculateControlInput(currentState) : 0;
        
        points.push({
          t,
          states: [...currentState],
          u
        });
      }
      
      setSimulationData({
        points,
        isRunning: false
      });
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "An error occurred during simulation");
      setSimulationData(prev => ({ ...prev, isRunning: false, points: [] }));
    }
  };

  const handleTimeVectorChange = (field: 'duration' | 'sampleTime', value: number) => {
    setTimeVector(prev => ({
      ...prev,
      [field]: value
    }));
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
              defaultValue="fully-actuated-pendulum"
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
            <div>s.t. {useDConstraint ? (
              <>
                D = [-W*A<sup>T</sup> - A*W + ρBB<sup>T</sup>, W*L<sup>T</sup>; L*W, I] ≽ 0
              </>
            ) : (
              <>H = A*W + W*A<sup>T</sup> - ρBB<sup>T</sup> + 2λW ≺ 0</>
            )}</div>
            <div className="constraints">
              α<sub>min</sub>I ≼ W ≼ α<sub>max</sub>I, W = W<sup>T</sup> ≻ 0, ρ ≥ 0
            </div>
          </div>
          <div className="settings-row">
            <div className="parameter-group">
              <label>Constraint Type:</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    checked={!useDConstraint}
                    onChange={() => setUseDConstraint(false)}
                  />
                  H ≺ 0
                </label>
                <label>
                  <input
                    type="radio"
                    checked={useDConstraint}
                    onChange={() => setUseDConstraint(true)}
                  />
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
                  : `[${lmiAnalysis.minEigH?.toFixed(4) || 'N/A'}, ${lmiAnalysis.maxEigH?.toFixed(4) || 'N/A'}]`
                }
              </span>
            </div>
            <div className="result-row">
              <span>W Eigenvalue Range:</span>
              <span>[{lmiAnalysis.minEigW.toFixed(4)}, {lmiAnalysis.maxEigW.toFixed(4)}]</span>
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
                  <span className={`mode-text ${simulationMode === 'open-loop' ? 'active' : ''}`}>
                    Open-Loop
                  </span>
                  <Switch
                    checked={simulationMode === 'closed-loop'}
                    onChange={(checked: boolean) => setSimulationMode(checked ? 'closed-loop' : 'open-loop')}
                    disabled={!canEnableClosedLoop()}
                    className={`switch-base ${
                      canEnableClosedLoop() ? 'switch-enabled' : 'switch-disabled'
                    }`}
                  >
                    <span
                      className={`switch-handle ${
                        simulationMode === 'closed-loop' ? 'switch-handle-active' : ''
                      }`}
                    />
                  </Switch>
                  <span className={`mode-text ${simulationMode === 'closed-loop' ? 'active' : ''}`}>
                    Closed-Loop
                  </span>
                </div>
                <button
                  onClick={runSimulation}
                  disabled={simulationData.isRunning}
                  className="simulate-button"
                >
                  {simulationData.isRunning ? 'Simulating...' : 'Run Simulation'}
                </button>
              </div>
              {!canEnableClosedLoop() && (
                <div className="mode-hint">
                  Run CCM-LMI analysis first to enable closed-loop simulation
                </div>
              )}
              {simulationMode === 'closed-loop' && (
                <div className="equation-block" style={{ marginTop: '16px', fontSize: '0.9em' }}>
                  {states.length === 4 && states[2]?.name === 'p' ? (
                    // Cart-pole system
                    <div>u = -0.5ρ · B<sup>T</sup>W<sup>-1</sup>(x - [0;0;0;0])</div>
                  ) : (
                    // Inverted pendulum
                    <div>u = -0.5ρ · B<sup>T</sup>W<sup>-1</sup>(x - [π;0])</div>
                  )}
                </div>
              )}
            </div>
            
            {simulationData.points.length > 0 && (
              <div className="simulation-plot">
                {/* Add appropriate animation based on system type */}
                {states.length === 4 && states[2]?.name === 'p' ? (
                  <div style={{ 
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>Cart-Pole Animation</h3>
                    <CartPoleAnimation
                      simulationData={simulationData.points}
                      duration={timeVector.duration}
                      width={450}
                      height={200}
                    />
                  </div>
                ) : Object.entries(systemConfigs).find(([key, config]) => 
                  key === 'fully-actuated-pendulum' && 
                  config.states[0].name === states[0].name
                ) && (
                  <div style={{ 
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>Pendulum Animation</h3>
                    <PendulumAnimation
                      simulationData={simulationData.points}
                      duration={timeVector.duration}
                      width={180}
                      height={180}
                    />
                  </div>
                )}

                {/* States Plot */}
                <LineChart
                  width={600}
                  height={200}
                  data={simulationData.points}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="t" 
                    ticks={Array.from(
                      { length: Math.floor(timeVector.duration / 2) + 1 },
                      (_, i) => i * 2
                    )}
                    tickCount={Math.floor(timeVector.duration / 2) + 1}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend 
                    layout="horizontal"
                    align="right"
                    verticalAlign="top"
                    wrapperStyle={{
                      paddingLeft: "10px",
                      paddingTop: "10px",
                      backgroundColor: "rgba(255, 255, 255, 0.8)",
                      borderRadius: "4px"
                    }}
                  />
                  {states.map((state, idx) => (
                    <Line 
                      key={`state-${idx}`}
                      type="monotone" 
                      dataKey={`states[${idx}]`}
                      stroke={['#8884d8', '#82ca9d', '#ffc658', '#ff7300'][idx]}
                      name={state.name || `x${idx+1}`}
                      dot={false} 
                    />
                  ))}
                </LineChart>

                {/* Control Input Plot */}
                {simulationMode === 'closed-loop' && (
                  <LineChart
                    width={600}
                    height={200}
                    data={simulationData.points}
                    margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="t" 
                      label={{ value: 'Time (s)', position: 'bottom' }}
                      ticks={Array.from(
                        { length: Math.floor(timeVector.duration / 2) + 1 },
                        (_, i) => i * 2
                      )}
                      tickCount={Math.floor(timeVector.duration / 2) + 1}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend 
                      layout="horizontal"
                      align="right"
                      verticalAlign="top"
                      wrapperStyle={{
                        paddingLeft: "10px",
                        paddingTop: "10px",
                        backgroundColor: "rgba(255, 255, 255, 0.8)",
                        borderRadius: "4px"
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="u"
                      stroke="#ff7300"
                      name="control input"
                      dot={false}
                    />
                  </LineChart>
                )}
              </div>
            )}

            {/* Add this error message display in the simulation panel, after the simulation button */}
            {simulationError && (
              <div className="simulation-error">
                {simulationError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App