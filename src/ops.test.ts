import { describe, expect, it } from 'vitest';
import { BigBallSportsClient, HttpError } from './index.js';
import { asErrorResponse, call, operationNames, operations } from './ops.js';

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const seen: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, seen };
}
const ok = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: { source: 'stored', cached: false, request_id: 'req_1' },
      error: null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('generated operation registry', () => {
  // The spec-derived assertions (registry covers exactly what the contract
  // documents, and `responseTyped` never over-reports) live in
  // ops-spec-coverage.test.ts, because they read the canonical OpenAPI
  // document, which is maintained alongside the API and is not part of this
  // published repository. The cases below need nothing outside this package,
  // so they ship with the public export and run there.
  it('assigns every operation a unique name', () => {
    expect(new Set(operationNames).size).toBe(operationNames.length);
  });

  it('declares path params for every {placeholder} in every path', () => {
    const mismatches = operationNames.filter((n) => {
      const spec = operations[n];
      const inPath = [...spec.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
      return inPath.some((p) => !spec.pathParams.includes(p));
    });
    expect(mismatches).toEqual([]);
  });

  it('reports the registry size rather than a verdict', () => {
    // A count invites "could it have been fewer?"; a bare pass does not. This
    // floor is the half of the comparison that needs no spec on disk: it
    // catches a regeneration that silently DROPS operations, which is the
    // failure a passing build would otherwise hide.
    //
    // It is one-sided on purpose, so it only ever reports too few. Raise it
    // only together with a regeneration that genuinely adds operations, and
    // never lower it to make a red run green: the published route surface is
    // something customers rely on, so a lower floor is a weaker promise and
    // not a test fix.
    const OPERATION_FLOOR = 162;
    console.log(`generated operations: ${operationNames.length}`);
    expect(operationNames.length).toBeGreaterThanOrEqual(OPERATION_FLOOR);
  });
});

describe('call()', () => {
  it('substitutes path params and comma-joins nothing into the path', async () => {
    const f = stubFetch(() => ok({ id: 'm1', status: 'scheduled' }));
    const c = new BigBallSportsClient('k', { fetchImpl: f.impl });
    await call(c, 'getMatchesById', { id: 'a/b c' });
    expect(f.seen[0]!.url).toBe('https://api.bigballsdata.com/v1/matches/a%2Fb%20c');
  });

  it('sends declared query params and drops undefined ones', async () => {
    const f = stubFetch(() => ok([]));
    const c = new BigBallSportsClient('k', { fetchImpl: f.impl });
    await call(c, 'getMatches', { sport: 'football', league: undefined, limit: 3 });
    const u = new URL(f.seen[0]!.url);
    expect(u.searchParams.get('sport')).toBe('football');
    expect(u.searchParams.get('limit')).toBe('3');
    expect(u.searchParams.has('league')).toBe(false);
  });

  it('refuses to issue a request with a missing path param', async () => {
    const f = stubFetch(() => ok(null));
    const c = new BigBallSportsClient('k', { fetchImpl: f.impl });
    await expect(call(c, 'getMatchesById', { id: undefined as unknown as string })).rejects.toThrow(
      /missing required path parameter 'id'/,
    );
    // The point of the guard: no request went out at all.
    expect(f.seen.length).toBe(0);
  });

  it('joins a caller AbortSignal to the request', async () => {
    const f = stubFetch((_u, init) => {
      expect(init?.signal?.aborted).toBe(true);
      return ok([]);
    });
    const c = new BigBallSportsClient('k', { fetchImpl: f.impl });
    const ac = new AbortController();
    ac.abort();
    await call(c, 'getMatches', { sport: 'football' }, { signal: ac.signal });
    expect(f.seen.length).toBe(1);
  });
});

describe('asErrorResponse', () => {
  const body = {
    error: { code: 'bad_request', message: 'nope' },
    suggested_fix: 'do the other thing',
    docs_url: 'https://bigballsdata.com/docs/errors',
    support: { discord: 'https://discord.gg/x', email: 'support@bigballsdata.com' },
    meta: { request_id: 'req_9', timestamp: '2026-09-18T00:00:00Z' },
  };

  it('surfaces every field of the gateway error contract', async () => {
    const f = stubFetch(
      () =>
        new Response(JSON.stringify(body), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const c = new BigBallSportsClient('k', { fetchImpl: f.impl });
    const err = await call(c, 'getMatches', { sport: 'football' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    const parsed = asErrorResponse(err);
    expect(parsed).not.toBeNull();
    expect(parsed!.error.code).toBe('bad_request');
    expect(parsed!.suggested_fix).toBe('do the other thing');
    expect(parsed!.docs_url).toBe(body.docs_url);
    expect(parsed!.support.email).toBe('support@bigballsdata.com');
    expect(parsed!.meta.request_id).toBe('req_9');
  });

  it('returns null rather than asserting on a body that is not the contract', () => {
    expect(asErrorResponse(new HttpError('x', 500, 'plain text'))).toBeNull();
    expect(asErrorResponse(new HttpError('x', 500, { error: 'a string' }))).toBeNull();
    expect(asErrorResponse(new HttpError('x', 500, { error: null }))).toBeNull();
    expect(asErrorResponse(new HttpError('x', 500, { error: 42 }))).toBeNull();
    expect(
      asErrorResponse(new HttpError('x', 500, { error: { code: 1, message: 'x' } })),
    ).toBeNull();
    expect(asErrorResponse(new HttpError('x', 500, { error: { code: 'c' } }))).toBeNull();
    expect(asErrorResponse(new Error('not http'))).toBeNull();
  });
});
