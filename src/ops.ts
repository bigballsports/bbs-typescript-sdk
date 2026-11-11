/**
 * Generated route surface — the typed, spec-derived half of the SDK.
 *
 * This file is hand-written and reviewed once; everything it is generic over
 * comes from `./generated/operations.js`, which is regenerated from the
 * canonical OpenAPI contract by `pnpm --filter @bigballsdata/sdk generate`.
 * Adding a route to the canonical OpenAPI contract therefore adds it here with no code
 * change, which is the whole point: route coverage stops being hand-maintained.
 *
 * Additive only. Nothing in the hand-written `BigBallSportsClient` surface
 * changes, so every 0.1.x consumer keeps compiling.
 */
import type { BigBallSportsClient } from './index.js';
import { HttpError } from './index.js';
import type { ErrorResponse } from './generated/schemas.js';
import {
  operations,
  type GeneratedEnvelope,
  type OperationName,
  type OperationTypes,
} from './generated/operations.js';

export * from './generated/operations.js';

export interface CallOptions {
  /**
   * Caller-supplied cancellation. Joined with the client's internal timeout,
   * so aborting this signal aborts the request and the timeout still applies.
   */
  readonly signal?: AbortSignal;
}

/**
 * A 4xx/5xx body as the gateway actually shapes it: `error.code`,
 * `error.message`, `suggested_fix`, `docs_url`, `support` and
 * `meta.request_id` — plus `meta.upgrade_path` on a quota 429 and a
 * plan-gate 403. `HttpError.body` is `unknown` by design; this narrows it
 * without asserting.
 */
export function asErrorResponse(err: unknown): ErrorResponse | null {
  if (!(err instanceof HttpError)) return null;
  const b = err.body;
  if (typeof b !== 'object' || b === null) return null;
  const e = (b as { error?: unknown }).error;
  if (typeof e !== 'object' || e === null) return null;
  if (typeof (e as { code?: unknown }).code !== 'string') return null;
  if (typeof (e as { message?: unknown }).message !== 'string') return null;
  return b as ErrorResponse;
}

function buildPath(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') {
      throw new TypeError(`missing required path parameter '${key}' for ${template}`);
    }
    return encodeURIComponent(String(v));
  });
}

/**
 * Invoke any documented operation by name, with its parameters and its
 * response payload typed from the spec.
 *
 * ```ts
 * const r = await call(client, 'getMatches', { sport: 'football', league: 'epl' });
 * r.data[0].home.name; // typed — Match[] comes from the contract
 * ```
 */
export async function call<N extends OperationName>(
  client: BigBallSportsClient,
  name: N,
  params: OperationTypes[N]['params'],
  options: CallOptions = {},
): Promise<GeneratedEnvelope<OperationTypes[N]['data']>> {
  const spec = operations[name] as {
    method: string;
    path: string;
    pathParams: readonly string[];
    queryParams: readonly string[];
  };
  const p = (params ?? {}) as Record<string, unknown>;
  const url = buildPath(spec.path, p);
  const query: Record<string, string | number | boolean | readonly string[] | undefined> = {};
  for (const k of spec.queryParams) {
    const v = p[k];
    if (v !== undefined) query[k] = v as string | number | boolean | readonly string[];
  }
  if (spec.method === 'get') {
    return (await client.get(url, query, options)) as GeneratedEnvelope<OperationTypes[N]['data']>;
  }
  const body: Record<string, unknown> = {};
  for (const k of Object.keys(p)) {
    if (!spec.pathParams.includes(k) && !spec.queryParams.includes(k)) body[k] = p[k];
  }
  return (await client.post(url, body, options)) as GeneratedEnvelope<OperationTypes[N]['data']>;
}

/** Every documented operation name, so coverage can be counted, not claimed. */
export const operationNames = Object.keys(operations) as OperationName[];
