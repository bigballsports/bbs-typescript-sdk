#!/usr/bin/env node
/**
 * Verify the SDK as a CONSUMER sees it, from outside the development workspace.
 *
 * WHY THIS EXISTS (audit 2026-07-24). `@bigballsdata/sdk@0.1.0` shipped for
 * ~7 weeks with entry points that pointed at `./src/index.ts` while `files`
 * shipped only `dist`. Every documented import failed:
 *
 *   import { BigBallSportsClient } from '@bigballsdata/sdk';
 *   -> TS2307: Cannot find module '@bigballsdata/sdk'
 *
 * Nothing in the repo caught it, and nothing could have: inside the workspace,
 * the workspace links this package by path and TS resolves `src/` directly, so the
 * broken manifest is completely masked. The bug is only observable after
 * `npm pack` + install into a clean project — which is exactly what this does.
 *
 * The `publishConfig` block made it subtler still: it overrode `main` and
 * `types` for the published tarball but NOT `exports`, and `exports` wins in
 * modern Node/TS resolution. So the manifest looked half-fixed and wasn't.
 *
 * Steps:
 *   1. npm pack the SDK.
 *   2. Install the tarball into a throwaway project (no workspace, no aliases).
 *   3. Typecheck the documented import under NodeNext resolution.
 *   4. Optionally hit the real API (only when BBS_API_KEY is present).
 *
 * Run: node scripts/verify-package.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SDK_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'bbs-sdk-verify-'));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let failed = false;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`ok    ${msg}`);

try {
  // 1. Build + pack exactly what customers download.
  run('npx', ['tsc', '--noEmit', 'false'], SDK_DIR);
  const packed = run('npm', ['pack', '--pack-destination', work], SDK_DIR).trim().split('\n').pop();
  const tarball = join(work, packed);
  ok(`packed ${packed}`);

  // 2. Clean-room install. No workspace, no path aliases, no tsconfig paths.
  const proj = join(work, 'consumer');
  run('mkdir', ['-p', proj]);
  writeFileSync(
    join(proj, 'package.json'),
    JSON.stringify(
      { name: 'sdk-consumer-smoke', version: '1.0.0', private: true, type: 'module' },
      null,
      2,
    ),
  );
  try {
    run('npm', ['i', tarball, 'typescript@5', '@types/node'], proj);
  } catch (e) {
    throw new Error(
      `clean-room npm install failed:\n${e.stdout || ''}${e.stderr || ''}${e.message || ''}`,
    );
  }

  const shipped = readdirSync(join(proj, 'node_modules', '@bigballsdata', 'sdk'));
  if (!shipped.includes('dist')) fail(`tarball has no dist/: ${shipped.join(', ')}`);
  else ok('tarball ships dist/');

  // 3. The documented import must typecheck under NodeNext, which honours
  //    `exports` — the field publishConfig forgot.
  writeFileSync(
    join(proj, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
    }),
  );
  writeFileSync(
    join(proj, 'smoke.ts'),
    [
      "import { BigBallSportsClient } from '@bigballsdata/sdk';",
      'const client = new BigBallSportsClient(process.env.BBS_API_KEY!);',
      "const res = await client.matches.list({ sport: 'basketball', limit: 2 });",
      'const matchId: string | undefined = res.data[0]?.id;',
      "if (matchId) await client.matches.get(matchId, ['scores'], 'basketball');",
      'console.log(res.data.length);',
      '',
    ].join('\n'),
  );
  try {
    run('npx', ['tsc', '-p', 'tsconfig.json'], proj);
    ok('documented import typechecks from a clean project');
  } catch (e) {
    fail(`documented import does not typecheck:\n${e.stdout || e.message}`);
  }

  // 4. Live smoke — only with a key. Proves DEFAULT_BASE_URL points at the real
  //    API (0.1.0 defaulted to api.bigballsports.com, which 302s to HTML and
  //    crashed the client with "Unexpected token '<'").
  if (process.env.BBS_API_KEY) {
    writeFileSync(
      join(proj, 'live.mjs'),
      [
        "import { BigBallSportsClient } from '@bigballsdata/sdk';",
        'const c = new BigBallSportsClient(process.env.BBS_API_KEY);',
        "const r = await c.matches.list({ sport: 'basketball', limit: 2 });",
        "if (!Array.isArray(r.data)) { console.error('data is not an array'); process.exit(1); }",
        'console.log(r.data.length);',
        '',
      ].join('\n'),
    );
    try {
      const rows = run('node', ['live.mjs'], proj).trim();
      ok(`live call through the tarball returned ${rows} row(s)`);
    } catch (e) {
      fail(`live call failed:\n${e.stdout || e.stderr || e.message}`);
    }
  } else {
    console.log('skip  live call (no BBS_API_KEY in env)');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
