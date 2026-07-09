import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BASELINE_BALANCE_SIMULATION,
  DEFAULT_BALANCE_SIMULATION_SCENARIOS,
  formatBalanceSimulationSummary,
  renderBalanceScenarioSummaryCsv,
  renderBalanceSimulationCsv,
  runBalanceSimulation,
} from '../src/game/balanceSimulator';

const args = new Set(process.argv.slice(2));
const results = DEFAULT_BALANCE_SIMULATION_SCENARIOS.map(runBalanceSimulation);
const [result] = results;
const csv = renderBalanceSimulationCsv(
  result,
  args.has('--all')
    ? result.rows.map(row => row.stage)
    : BASELINE_BALANCE_SIMULATION.checkpointStages,
);

console.log(results.map(formatBalanceSimulationSummary).join('\n\n'));
console.log('\nScenario comparison');
console.log(renderBalanceScenarioSummaryCsv(results).trimEnd());
console.log('');
console.log('Baseline checkpoints');
console.log(csv.trimEnd());

if (args.has('--write')) {
  const outputs = [
    ['docs/balance/baseline-progression.csv', csv],
    ['docs/balance/scenario-summary.csv', renderBalanceScenarioSummaryCsv(results)],
  ] as const;

  for (const [relativePath, contents] of outputs) {
    const outputPath = resolve(relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, contents, 'utf8');
    console.log(`\nWrote ${outputPath}`);
  }
}
