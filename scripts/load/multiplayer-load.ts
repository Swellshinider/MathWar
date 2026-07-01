import { assertOptions, parseArgs, run } from './multiplayer-load-core.js';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertOptions(options);
  if (options.dryRun) {
    console.log(JSON.stringify(options, null, 2));
    return;
  }
  const summary = await run(options);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
