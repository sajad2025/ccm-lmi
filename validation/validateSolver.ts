// Regression guard for the pure-JS CCM-LMI solver.
//
// Runs src/solver/sdpSolver.ts against ground_truth.json — a frozen set of
// cvxpy/Clarabel reference results (see genGroundTruth.py) — and checks that
// every feasibility verdict matches and every feasible ρ agrees within
// tolerance. No Python or network needed; the fixture is committed.
//
// Run:  npm run validate:solver
// (requires Node >= 22.6 for native TypeScript execution via type stripping)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { solveCCM, type CCMPayload } from '../src/solver/sdpSolver.ts';

interface TestCase {
  name: string;
  payload: CCMPayload;
  expected: { feasible: boolean; rho: number };
}

const REL_TOL = 2e-3; // relative ρ tolerance vs cvxpy/Clarabel

const here = dirname(fileURLToPath(import.meta.url));
const gt = JSON.parse(readFileSync(join(here, 'ground_truth.json'), 'utf8')) as { cases: TestCase[] };

let pass = 0;
let maxRel = 0;
const failures: string[] = [];

for (const c of gt.cases) {
  const r = solveCCM(c.payload);
  const feasMatch = r.feasible === c.expected.feasible;
  let rhoOk = true;
  let rel = 0;
  if (c.expected.feasible && r.feasible) {
    rel = Math.abs(r.rho - c.expected.rho) / Math.max(1, Math.abs(c.expected.rho));
    rhoOk = rel < REL_TOL;
    maxRel = Math.max(maxRel, rel);
  }
  if (feasMatch && rhoOk) {
    pass++;
  } else {
    failures.push(
      `${c.name}: expected {feasible:${c.expected.feasible}, rho:${c.expected.rho.toFixed(6)}} ` +
        `got {feasible:${r.feasible}, rho:${r.rho.toFixed(6)}} relErr=${rel.toExponential(2)}`,
    );
  }
}

console.log(`CCM-LMI solver validation: ${pass}/${gt.cases.length} cases pass`);
console.log(`max relative rho error: ${maxRel.toExponential(2)} (tolerance ${REL_TOL.toExponential(0)})`);
for (const f of failures) console.error('  FAIL ' + f);

process.exit(failures.length === 0 ? 0 : 1);
