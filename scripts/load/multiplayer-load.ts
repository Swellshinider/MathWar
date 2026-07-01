import {
  assertOptions,
  createSuiteSummary,
  expandAllScenario,
  parseArgs,
  run,
  writeOutputFile,
} from './multiplayer-load-core.js';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertOptions(options);
  const expanded = expandAllScenario(options);
  if (options.dryRun) {
    console.log(JSON.stringify(options.scenario === 'all' ? expanded : options, null, 2));
    return;
  }
  if (options.scenario === 'all') {
    const startedAt = Date.now();
    const runs = [];
    for (const runOptions of expanded) {
      runs.push(
        await run({
          ...runOptions,
          metricsOut: options.metricsOut
            ? suffixedOutputPath(options.metricsOut, `${runOptions.scenario}-${runOptions.game}`)
            : undefined,
          jsonOut: undefined,
        }),
      );
    }
    const summary = createSuiteSummary(options, runs, Date.now() - startedAt);
    if (options.jsonOut) {
      await writeOutputFile(options.jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
    }
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const summary = await run(options);
  console.log(JSON.stringify(summary, null, 2));
}

function suffixedOutputPath(path: string, suffix: string): string {
  const slashIndex = path.lastIndexOf('/');
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex > slashIndex) {
    return `${path.slice(0, dotIndex)}.${suffix}${path.slice(dotIndex)}`;
  }
  return `${path}.${suffix}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
