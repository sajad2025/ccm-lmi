// Open-loop linearization analysis: sweep the Jacobian's eigenvalues over a
// grid of the state-space box and report their real/imaginary extents.

import * as math from 'mathjs';
import type { EigenvalueAnalysis, JacobianElement, Signal } from '../types';
import { evaluateJacobianAtPoint } from './dynamics';

export function analyzeEigenvalues(
  states: Signal[],
  jacobian: JacobianElement[][],
  n: number,
  gridSize: number,
): EigenvalueAnalysis {
  let minReal = Infinity;
  let maxReal = -Infinity;
  let minImag = Infinity;
  let maxImag = -Infinity;
  let totalPoints = 0;

  // Sample points along each state's range.
  const gridPoints = states.map((state) => {
    const range = state.max - state.min;
    if (range === 0) return [state.min];
    const numPoints = Math.max(2, Math.ceil(range / gridSize));
    const step = range / (numPoints - 1);
    return Array.from({ length: numPoints }, (_, i) => state.min + i * step);
  });

  const visit = (current: number[], depth: number): void => {
    if (depth === n) {
      const stateValues: Record<string, number> = {};
      states.forEach((state, i) => {
        stateValues[state.name || `x${i + 1}`] = current[i];
      });

      try {
        const A = evaluateJacobianAtPoint(jacobian, stateValues, n);
        const result = math.eigs(A);
        if (result && Array.isArray(result.values)) {
          result.values.forEach((value: unknown) => {
            let re = 0;
            let im = 0;
            if (typeof value === 'number') {
              re = value;
            } else if (math.typeOf(value) === 'Complex') {
              const cplx = value as { re?: number; im?: number };
              re = Number(cplx.re || 0);
              im = Number(cplx.im || 0);
            } else {
              return;
            }
            if (!isNaN(re)) {
              minReal = Math.min(minReal, re);
              maxReal = Math.max(maxReal, re);
            }
            if (!isNaN(im)) {
              minImag = Math.min(minImag, im);
              maxImag = Math.max(maxImag, im);
            }
          });
        }
        totalPoints++;
      } catch (error) {
        console.error('Error in eigenvalue analysis at point:', stateValues, error);
      }
      return;
    }

    for (const value of gridPoints[depth]) {
      current[depth] = value;
      visit(current, depth + 1);
    }
  };

  visit(new Array(n).fill(0), 0);

  return {
    minRealEig: minReal === Infinity ? 0 : minReal,
    maxRealEig: maxReal === -Infinity ? 0 : maxReal,
    minImagEig: minImag === Infinity ? 0 : minImag,
    maxImagEig: maxImag === -Infinity ? 0 : maxImag,
    gridPoints: totalPoints,
  };
}
