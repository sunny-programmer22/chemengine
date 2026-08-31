/**
 * Test runner for the Chemistry Bot
 * Runs all *.test.js files in this directory and prints a summary
 *
 * Usage: node test/run-tests.js
 *
 * Exit code: 0 on all pass, 1 on any fail.
 */

const fs = require('fs');
const path = require('path');

let totalPassed = 0;
let totalFailed = 0;
let totalAssertions = 0;
const suiteResults = [];

/**
 * Run a single test suite file
 */
async function runSuite(suitePath) {
  const suiteName = path.basename(suitePath);
  const start = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${suiteName}`);
  console.log(`${'='.repeat(60)}`);

  // Set up the local test context
  const ctx = { passed: 0, failed: 0 };
  const localAssert = require('assert');
  const pendingTests = [];

  const test = (name, fn) => {
    const p = (async () => {
      try {
        await fn();
        console.log(`  ✓ ${name}`);
        ctx.passed++;
        totalAssertions++;
      } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        if (process.env.VERBOSE && err.stack) {
          const lines = err.stack.split('\n').slice(1, 4);
          console.log(`    Stack: ${lines.join('\n           ')}`);
        }
        ctx.failed++;
        totalAssertions++;
      }
    })();
    pendingTests.push(p);
    return p;
  };

  // Provide globals to the test file
  const sandbox = {
    test,
    it: test,
    assert: localAssert,
    describe: async (name, fn) => {
      console.log(`\n  -- ${name} --`);
      await fn();
    }
  };

  // Inject sandbox into the module's scope
  const moduleCode = fs.readFileSync(suitePath, 'utf8');
  const moduleObj = { exports: {} };
  const requireFn = (id) => {
    // Resolve relative paths
    if (id.startsWith('.')) {
      const resolved = path.resolve(path.dirname(suitePath), id);
      return require(resolved);
    }
    return require(id);
  };
  const moduleParam = moduleObj;
  const exportsParam = moduleObj.exports;
  const __filename = suitePath;
  const __dirname = path.dirname(suitePath);

  // Wrap test/assert/describe so they're available in the file
  const wrappedRequire = (id) => {
    return requireFn(id);
  };

  // Provide global-like scope via Function constructor
  const fn = new Function(
    'test', 'it', 'assert', 'describe', 'require', 'module', 'exports', '__filename', '__dirname',
    moduleCode
  );

  try {
    await fn(test, test, localAssert, sandbox.describe, wrappedRequire, moduleParam, exportsParam, __filename, __dirname);
  } catch (err) {
    console.log(`  ✗ Suite failed: ${err.message}`);
    if (err.stack) console.log(err.stack);
    ctx.failed++;
  }

  // Wait for all pending async tests to complete
  await Promise.all(pendingTests);

  const elapsed = Date.now() - start;

  totalPassed += ctx.passed;
  totalFailed += ctx.failed;

  suiteResults.push({
    name: suiteName,
    passed: ctx.passed,
    failed: ctx.failed,
    elapsed
  });

  const status = ctx.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${ctx.passed} passed, ${ctx.failed} failed (${elapsed}ms)`);
}

/**
 * Find all test files in the test/ directory
 */
function findTestFiles() {
  const testDir = __dirname;
  return fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.js'))
    .map(file => path.join(testDir, file))
    .sort();
}

/**
 * Print final summary table
 */
function printSummary() {
  const total = totalPassed + totalFailed;
  const overallStatus = totalFailed === 0 ? 'PASS' : 'FAIL';

  console.log(`\n${'='.repeat(60)}`);
  console.log('  TEST SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  // Table header
  const nameWidth = Math.max(...suiteResults.map(r => r.name.length), 20);
  console.log(
    `  ${'Suite'.padEnd(nameWidth)}  ${'Pass'.padStart(6)}  ${'Fail'.padStart(6)}  ${'Status'.padStart(8)}  ${'Time'.padStart(8)}`
  );
  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(6)}  ${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(8)}`);

  for (const r of suiteResults) {
    const status = r.failed === 0 ? 'PASS' : 'FAIL';
    console.log(
      `  ${r.name.padEnd(nameWidth)}  ${String(r.passed).padStart(6)}  ${String(r.failed).padStart(6)}  ${status.padStart(8)}  ${(r.elapsed + 'ms').padStart(8)}`
    );
  }

  console.log(`  ${'-'.repeat(nameWidth)}  ${'-'.repeat(6)}  ${'-'.repeat(6)}  ${'-'.repeat(8)}  ${'-'.repeat(8)}`);

  const totalElapsed = suiteResults.reduce((sum, r) => sum + r.elapsed, 0);
  console.log(
    `  ${'TOTAL'.padEnd(nameWidth)}  ${String(totalPassed).padStart(6)}  ${String(totalFailed).padStart(6)}  ${overallStatus.padStart(8)}  ${(totalElapsed + 'ms').padStart(8)}`
  );

  console.log(`\n  Total:  ${total} assertions`);
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log(`  Time:   ${totalElapsed}ms\n`);

  if (totalFailed > 0) {
    console.log(`  ${'!'.repeat(60)}`);
    console.log(`  ! ${totalFailed} test(s) FAILED`);
    console.log(`  ${'!'.repeat(60)}\n`);
  } else {
    console.log(`  ${'*'.repeat(60)}`);
    console.log(`  * All ${total} tests PASSED`);
    console.log(`  ${'*'.repeat(60)}\n`);
  }
}

/**
 * Main: run all test suites
 */
async function main() {
  console.log('\n  Chemistry Bot Test Suite');
  console.log(`  Node: ${process.version}`);
  console.log(`  Date: ${new Date().toISOString()}\n`);

  const testFiles = findTestFiles();

  if (testFiles.length === 0) {
    console.log('No test files found in test/');
    process.exit(1);
  }

  for (const testFile of testFiles) {
    await runSuite(testFile);
  }

  printSummary();

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
