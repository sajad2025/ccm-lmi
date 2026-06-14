// Predefined example systems, selectable from the System dropdown.

import type { SystemConfig } from './types';

export const systemConfigs: Record<string, SystemConfig> = {
  empty: {
    name: 'Empty System',
    n: 1,
    m: 1,
    states: [{ name: '', min: -0.1, max: 0.1, ic: 0 }],
    matrixA: [[{ expression: '0' }]],
    matrixB: [[{ expression: '0' }]],
    lmiParams: { lambda: 0.5, alphaMin: 0.01, alphaMax: 5.0 },
    matrixQ: [1],
  },
  'fully-actuated-pendulum': {
    name: 'Fully-Actuated Inverted Pendulum',
    n: 2,
    m: 1,
    states: [
      { name: 'theta', min: 2.9, max: 3.3, ic: 2.9 },
      { name: 'omega', min: -0.5, max: 0.5, ic: 0 },
    ],
    matrixA: [
      [{ expression: 'omega' }],
      [{ expression: '-10*sin(theta)-0.1*omega' }],
    ],
    matrixB: [[{ expression: '0' }], [{ expression: '1' }]],
    lmiParams: { lambda: 1, alphaMin: 0.1, alphaMax: 5.0 },
    matrixQ: [0, 0],
  },
  'under-actuated-cartpole': {
    name: 'Under-Actuated Cart-Pole',
    n: 4,
    m: 1,
    states: [
      { name: 'theta', min: -0.75, max: 0.75, ic: 0.1 },
      { name: 'eta', min: -0.5, max: 0.5, ic: 0 },
      { name: 'p', min: -0.2, max: 0.2, ic: 0 },
      { name: 'v', min: -1, max: 1, ic: 0 },
    ],
    matrixA: [
      [{ expression: 'eta*cos(theta)' }],
      [{ expression: 'eta^2*sin(theta)+tan(theta)' }],
      [{ expression: 'v' }],
      [{ expression: '0' }],
    ],
    matrixB: [
      [{ expression: '0' }],
      [{ expression: '-1' }],
      [{ expression: '0' }],
      [{ expression: '1' }],
    ],
    lmiParams: { lambda: 0.1, alphaMin: 0.005, alphaMax: 5.0 },
    matrixQ: [1, 1, 10, 1],
  },
};

/** The system loaded on first launch. */
export const DEFAULT_SYSTEM = 'fully-actuated-pendulum';
