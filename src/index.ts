/**
 * Big Balls Sports TypeScript SDK — thin HTTP + WebSocket client.
 *
 * The SDK is a zero-dependency wrapper around the canonical REST API and
 * the socket.io WebSocket surface. Types are inlined so the package is
 * publishable standalone; they track the canonical server-side shapes but
 * do not import them.
 *
 * Usage:
 *
 *   import { BigBallSportsClient } from '@bigballsdata/sdk'
 *
 *   const client = new BigBallSportsClient('bbs_xxx')
 *   const matches = await client.matches.list({ sport: 'football' })
 *   const one = await client.matches.get('abc', ['scores', 'odds'])
 */

// ---------------------------------------------------------------------------
// Re-export the canonical type surface. Customers using the SDK should
// import these directly from `@bigballsdata/sdk`; there is no need to
// depend on any other package for them.
// ---------------------------------------------------------------------------

export * from './canonical.js';
import type {
  CanonicalEvent,
  CanonicalForField,
  CanonicalOdds,
  CanonicalPlayer,
  CanonicalStandings,
  CanonicalStat,
  FieldKey,
  SportType,
} from './canonical.js';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ResponseMeta {
  /**
   * Opaque source-tier label (`official-league`, `aggregator-paid`,
   * `aggregator-free`, `community-scraper`, `mixed`, `cache`, `none`).
   * The vendor identity behind a source is never exposed.
   */
  source: string;
  /** Present on field-router responses; stored list responses may omit it. */
  confidence?: number;
  cached: boolean;
  /** Present when the serving path can measure cache age. */
  cache_age_ms?: number;
  request_id: string;
  fields_missing?: string[];
  /**
   * Short factual explanation of something the response withheld or
   * substituted, present only when there is something to say.
   *
   * Attached by stored fallback paths, and by live scores when `match_id`
   * could not be resolved to a stored match and was therefore omitted (the
   * note gives the counts and points at `/v1/stored/matches`). Absent when
   * there is nothing to disclose, so treat its presence as the signal.
   */
  note?: string;
}

export interface ApiResponse<T, M extends ResponseMeta = ResponseMeta> {
  data: T;
  meta: M;
  error: ApiError | null;
}

/**
 * Per-field cache envelope. `value` is typed by FieldKey via
 * `CanonicalForField[F]`, so `FieldResult<'scores'>` carries a
 * `CanonicalScore[]` and never raw vendor JSON.
 */
export interface FieldResult<F extends FieldKey = FieldKey> {
  value: CanonicalForField[F];
  source: string;
  via: 'api' | 'cache' | 'mcp';
  confidence: number;
  fetchedAt: string;
  ttlSeconds: number;
}

/**
 * Multi-field match payload returned by `/v1/matches/:id`. Each entry
 * is keyed by FieldKey; the value is the canonical-typed FieldResult or
 * null when the field couldn't be satisfied.
 */
export interface MatchSide {
  id: string | null;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
}

export interface MatchScore {
  home: number | null;
  away: number | null;
}

/** Core fields returned by match lists and used for list-to-detail chaining. */
export type Match = {
  /** Canonical Big Balls match UUID accepted by match-scoped SDK methods. */
  id: string;
  sport: SportType;
  league: string | null;
  home: MatchSide;
  away: MatchSide;
  kickoff_utc: string;
  status: string;
  score: MatchScore | null;
} & {
  [F in FieldKey]?: FieldResult<F> | null;
};

// Public re-aliases — convenience names customers can import. All are
// canonical types; the prior `{ [k: string]: unknown }` passthrough is gone.
export type Player = CanonicalPlayer;
export type OddsLine = CanonicalOdds;
export type MatchEvent = CanonicalEvent;
export type PlayerStats = CanonicalStat;
export type Standing = CanonicalStandings;
/** Injury reports surface as a canonical player; the absence of a return-date
 *  field means active. */
export type Injury = CanonicalPlayer;
export interface LiveEvent {
  type: string;
  data: unknown;
}

// ---- method-parameter shapes ---------------------------------------------

export interface MatchListParams {
  sport: SportType;
  league?: string;
  date?: string;
  status?: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  page?: number;
  limit?: number;
}

export interface StatsParams {
  sport: SportType;
  season?: string;
  league?: string;
  page?: number;
  limit?: number;
}

export interface InjuryParams {
  sport: SportType;
  team?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.bigballsdata.com';

export interface ClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  /** Optional explicit timeout in ms. Defaults to 15s. */
  readonly timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BigBallSportsClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  readonly matches: MatchesApi;
  readonly players: PlayersApi;
  readonly standings: StandingsApi;
  readonly injuries: InjuriesApi;
  readonly cricket: CricketApi;
  readonly combat: CombatApi;

  constructor(
    private readonly apiKey: string,
    options: ClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 15_000;

    this.matches = new MatchesApi(this);
    this.players = new PlayersApi(this);
    this.standings = new StandingsApi(this);
    this.injuries = new InjuriesApi(this);
    this.cricket = new CricketApi(this);
    this.combat = new CombatApi(this);
  }

  /** @internal — used by the sub-APIs. */
  async get<T, M extends ResponseMeta = ResponseMeta>(
    path: string,
    query: Readonly<Record<string, string | number | boolean | readonly string[] | undefined>> = {},
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<ApiResponse<T, M>> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) url.searchParams.set(k, v.join(','));
      else url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Join the caller's signal to the internal timeout: either one aborts the
    // request, and the timeout still applies when a caller supplies a signal.
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      return await this.readResponse<T, M>(response);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  /** @internal — used by `webhooks` + future POST endpoints. */
  async post<T, M extends ResponseMeta = ResponseMeta>(
    path: string,
    payload: unknown,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<ApiResponse<T, M>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Join the caller's signal to the internal timeout: either one aborts the
    // request, and the timeout still applies when a caller supplies a signal.
    const onCallerAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const response = await this.fetchImpl(new URL(path, this.baseUrl).toString(), {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return await this.readResponse<T, M>(response);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private async readResponse<T, M extends ResponseMeta = ResponseMeta>(
    response: Response,
  ): Promise<ApiResponse<T, M>> {
    const raw = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      throw new HttpError(
        response.ok
          ? `HTTP ${response.status} returned invalid JSON`
          : `Request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
        response.status,
        raw,
      );
    }

    if (!response.ok) {
      const error =
        typeof body === 'object' && body !== null && 'error' in body
          ? (body as { error?: unknown }).error
          : undefined;
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : `Request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      throw new HttpError(message, response.status, body);
    }

    return body as ApiResponse<T, M>;
  }

  /**
   * GraphQL subscription helper using the graphql-ws subprotocol at
   * `/graphql/ws`. The SDK doesn't ship `graphql-ws` as a hard dep —
   * callers include it themselves and pass `createClient` via
   * `options.graphqlWsClient`. (Same pattern as `subscribe(room, …)`
   * for socket.io-client.)
   *
   * Spec § Tech Stack: "GraphQL Yoga · subscriptions via WS".
   *
   * @example
   *   import { createClient } from 'graphql-ws';
   *   const stop = client.subscribeGraphql(
   *     `subscription M($id: ID!) { matchUpdated(matchId: $id) { id status scores { raw } } }`,
   *     { id: 'abc' },
   *     (data) => console.log(data),
   *     { graphqlWsClient: createClient },
   *   );
   *   // ...later: stop();
   */
  subscribeGraphql<TData = unknown, TVars = Record<string, unknown>>(
    query: string,
    variables: TVars,
    onData: (data: TData) => void,
    options: {
      graphqlWsClient?: unknown;
      url?: string;
      onError?: (err: unknown) => void;
      onComplete?: () => void;
    } = {},
  ): () => void {
    type GraphqlWsCreateClient = (opts: {
      url: string;
      connectionParams: Record<string, unknown>;
    }) => {
      subscribe: (
        payload: { query: string; variables?: unknown },
        sink: {
          next: (v: { data?: unknown }) => void;
          error: (e: unknown) => void;
          complete: () => void;
        },
      ) => () => void;
      dispose: () => void | Promise<void>;
    };
    const factory = options.graphqlWsClient as GraphqlWsCreateClient | undefined;
    if (!factory) {
      throw new Error(
        'subscribeGraphql() requires `graphqlWsClient`: install `graphql-ws` and pass createClient as options.graphqlWsClient',
      );
    }
    const httpUrl = new URL('/graphql/ws', options.url ?? this.baseUrl);
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const client = factory({
      url: httpUrl.toString(),
      connectionParams: { apiKey: this.apiKey },
    });

    const unsubscribeInner = client.subscribe(
      { query, variables },
      {
        next: (msg) => {
          if (msg.data !== undefined) onData(msg.data as TData);
        },
        error: (e) => options.onError?.(e),
        complete: () => options.onComplete?.(),
      },
    );

    return () => {
      try {
        unsubscribeInner();
      } finally {
        void client.dispose();
      }
    };
  }

  /**
   * WebSocket subscription helper. Connects via socket.io-client if
   * available in the runtime environment. Returns an unsubscribe fn.
   *
   * The SDK doesn't ship socket.io-client as a hard dep — callers include
   * it themselves and pass it via `options.socketIo`.
   */
  subscribe(
    room: string,
    onEvent: (event: LiveEvent) => void,
    options: { socketIo?: unknown; url?: string } = {},
  ): () => void {
    type IoFactory = (url: string, opts: Record<string, unknown>) => SocketHandle;
    const io = options.socketIo as IoFactory | undefined;
    if (!io) {
      throw new Error(
        'subscribe() requires `socketIo`: install `socket.io-client` and pass io as options.socketIo',
      );
    }
    const socketUrl = options.url ?? this.baseUrl;
    // Server mounts socket.io at `/live` per architecture spec § WebSocket —
    // Live Events ("wss://api.bigballsdata.com/live"). Override the
    // socket.io-client default of `/socket.io` to match.
    const socket = io(socketUrl, {
      path: '/live',
      extraHeaders: { 'x-api-key': this.apiKey },
      auth: { apiKey: this.apiKey },
    });

    const listener = (type: string, data: unknown): void => onEvent({ type, data });
    for (const type of SUBSCRIBABLE_EVENTS) {
      socket.on(type, (d: unknown) => listener(type, d));
    }

    socket.emit('join', room);

    return () => {
      socket.emit('leave', room);
      socket.close();
    };
  }
}

/**
 * Every event name `subscribe()` registers a listener for.
 *
 * This is a hand-kept COPY of the server's `EMITTABLE_EVENTS` list, and it
 * has to be: that list ships in a development-only dependency, so importing
 * it at runtime would break the published package for every consumer. A copy is exactly the
 * drift generator that shared list exists to prevent — a name added there and
 * missed here means the gateway emits an event no SDK user ever sees, silently
 * — so `type-tests/live-events.ts` asserts the two lists are identical at
 * COMPILE time, using the devDependency where it is safe to. Adding a name in
 * one place and not the other is a build failure, not a quiet gap.
 */
export const SUBSCRIBABLE_EVENTS = [
  'score_update',
  'odds_move',
  'lineup_confirmed',
  'match_start',
  'match_end',
  'goal',
  'card',
  'substitution',
  'heartbeat',
  'player_stats_update',
] as const;

/** Minimal structural type for socket.io-client — avoids pulling the types package. */
interface SocketHandle {
  on(event: string, handler: (data: unknown) => void): void;
  emit(event: string, payload: unknown): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Sub-APIs
// ---------------------------------------------------------------------------

class MatchesApi {
  constructor(private readonly client: BigBallSportsClient) {}

  list(params: MatchListParams): Promise<ApiResponse<Match[]>> {
    return this.client.get<Match[]>('/v1/matches', { ...params });
  }

  get(id: string, fields?: FieldKey[], sport?: SportType): Promise<ApiResponse<Match>> {
    return this.client.get<Match>(`/v1/matches/${encodeURIComponent(id)}`, {
      sport: sport ?? 'football',
      ...(fields && fields.length > 0 ? { fields } : {}),
    });
  }

  odds(id: string, sport?: SportType): Promise<ApiResponse<OddsLine[]>> {
    return this.client.get<OddsLine[]>(`/v1/matches/${encodeURIComponent(id)}/odds`, {
      sport: sport ?? 'football',
    });
  }

  events(id: string, sport?: SportType): Promise<ApiResponse<MatchEvent[]>> {
    return this.client.get<MatchEvent[]>(`/v1/matches/${encodeURIComponent(id)}/events`, {
      sport: sport ?? 'football',
    });
  }
}

class PlayersApi {
  constructor(private readonly client: BigBallSportsClient) {}

  get(id: string, sport: SportType): Promise<ApiResponse<Player>> {
    return this.client.get<Player>(`/v1/players/${encodeURIComponent(id)}`, { sport });
  }

  stats(id: string, params: StatsParams): Promise<ApiResponse<PlayerStats[]>> {
    return this.client.get<PlayerStats[]>(`/v1/players/${encodeURIComponent(id)}/stats`, {
      ...params,
    });
  }
}

class StandingsApi {
  constructor(private readonly client: BigBallSportsClient) {}

  get(
    league: string,
    season?: number,
    sport: SportType = 'football',
  ): Promise<ApiResponse<Standing[]>> {
    return this.client.get<Standing[]>('/v1/standings', {
      sport,
      leagueId: league,
      ...(season !== undefined ? { season: String(season) } : {}),
    });
  }
}

class InjuriesApi {
  constructor(private readonly client: BigBallSportsClient) {}

  list(params: InjuryParams): Promise<ApiResponse<Injury[]>> {
    return this.client.get<Injury[]>('/v1/injuries', { ...params });
  }
}

export interface CricketBattingScore {
  readonly innings_number: number;
  readonly player_id: string;
  readonly player_name: string | null;
  readonly runs: number;
  readonly balls: number;
  readonly fours: number;
  readonly sixes: number;
  /** Postgres decimal values are serialized as strings by the API. */
  readonly strike_rate: string | null;
  readonly dismissal_type: string | null;
  readonly dismissal_bowler_id: string | null;
}

export interface CricketBowlingScore {
  readonly innings_number: number;
  readonly player_id: string;
  readonly player_name: string | null;
  /** Postgres decimal values are serialized as strings by the API. */
  readonly overs: string;
  readonly maidens: number;
  readonly runs: number;
  readonly wickets: number;
  readonly economy: string | null;
  readonly wides: number;
  readonly no_balls: number;
}

export interface CricketInningsScorecard {
  readonly innings_number: number;
  readonly batting: readonly CricketBattingScore[];
  readonly bowling: readonly CricketBowlingScore[];
}

export interface CricketScorecard {
  readonly match_id: string;
  readonly innings: readonly CricketInningsScorecard[];
}

export interface CricketDelivery {
  readonly innings_number: number;
  readonly super_over: boolean;
  readonly over_number: number;
  readonly ball_seq: number;
  readonly batting_team: { readonly id: string; readonly name: string | null } | null;
  readonly batter: { readonly id: string; readonly name: string | null };
  readonly bowler: { readonly id: string; readonly name: string | null };
  readonly non_striker: { readonly id: string; readonly name: string | null } | null;
  readonly runs: { readonly batter: number; readonly extras: number; readonly total: number };
  readonly extras: {
    readonly wides: number;
    readonly no_balls: number;
    readonly byes: number;
    readonly leg_byes: number;
    readonly penalty: number;
  };
  readonly wicket: {
    readonly kind: string;
    readonly player_out: { readonly id: string; readonly name: string | null } | null;
    readonly fielder_ids: readonly string[];
  } | null;
}

export interface CricketDeliveriesPayload {
  readonly match_id: string;
  readonly deliveries: readonly CricketDelivery[];
}

export interface CricketDeliveriesMeta extends ResponseMeta {
  readonly available: boolean;
  readonly count: number;
  readonly limit: number;
  readonly stream: number | null;
  readonly available_streams: readonly number[];
  readonly next_cursor: string | null;
}

export interface CricketMatchState {
  readonly innings_number: number;
  readonly batting_team: { readonly id: string; readonly name: string | null } | null;
  readonly overs_bowled: number;
  readonly runs_scored: number;
  readonly wickets_fallen: number;
  readonly current_run_rate: number | null;
  readonly target: number | null;
  readonly required_run_rate: number | null;
  readonly dls_target: number | null;
  readonly result_method: string | null;
  readonly recorded_at: string;
}

export interface CricketMatchStatePayload {
  readonly match_id: string;
  readonly state: CricketMatchState | null;
}

export interface CricketMatchStateMeta extends ResponseMeta {
  readonly available: boolean;
  readonly filters_applied: { readonly innings: number | null };
  readonly live: boolean;
  readonly match_status: string;
}

export type CombatSport = 'mma' | 'boxing';

export interface MmaBout {
  readonly id: string;
  readonly event_date: string;
  readonly kickoff_utc: string;
  readonly league: string | null;
  readonly status: string;
  readonly fighters: {
    readonly home: { readonly name: string | null; readonly short_name: string | null };
    readonly away: { readonly name: string | null; readonly short_name: string | null };
  };
}

export interface MmaFightCard {
  readonly event_date: string;
  readonly league: string | null;
  readonly bout_count: number;
  readonly bouts: readonly MmaBout[];
}

export interface BoxingCardScore {
  readonly fighter_a: number;
  readonly fighter_b: number;
}

export interface BoxingScorecards {
  readonly raw: string | null;
  readonly judges: readonly string[] | null;
  readonly cards: readonly BoxingCardScore[] | null;
}

export type BoxingWinner = 'a' | 'b' | 'draw' | 'nc';

export interface BoxingResult {
  readonly winner: BoxingWinner | null;
  readonly winner_status?: 'undetermined';
  readonly winner_name: string | null;
  readonly method: string | null;
  readonly round: number | null;
  readonly time: string | null;
  readonly scheduled_rounds: number | null;
  readonly scorecards: BoxingScorecards | null;
}

export interface BoxingBout {
  readonly id: string;
  readonly card_id: string;
  readonly event_date: string;
  readonly bout_order: number | null;
  readonly status: string;
  readonly fighters: {
    readonly a: { readonly name: string | null };
    readonly b: { readonly name: string | null };
  };
  readonly result: BoxingResult;
  readonly weight_class: string | null;
  readonly sanctioning_body: string | null;
  readonly title_context: string | null;
  readonly knockdowns: { readonly a: number | null; readonly b: number | null };
}

export interface BoxingFightCard {
  readonly id: string;
  readonly sport: 'boxing';
  readonly event_date: string;
  readonly event_name: string | null;
  readonly promoter: string | null;
  readonly broadcast_network: string | null;
  readonly bout_count: number;
  readonly bouts: readonly BoxingBout[];
}

export interface BoxingAthleteRecord {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly no_contests: number;
}

export interface BoxingAthlete {
  readonly id: string;
  readonly name: string;
  readonly nationality: string | null;
  readonly dob: string | null;
  readonly height_cm: number | null;
  readonly reach_cm: number | null;
  readonly stance: string | null;
  readonly weight_class: string | null;
  readonly current_ranking: number | null;
  readonly record: BoxingAthleteRecord | null;
  /**
   * Source-neutral cross-reference ids.
   *
   * `encyclopedia` is the athlete's entity id in an open knowledge graph;
   * `record_book` is the athlete's id in a boxing record registry. Both are
   * stable strings meant for joining, and neither value changed when these
   * attributes were renamed under API version `2026-11-09` — a client pinned
   * to `2026-09-01` receives the same values under the previous attribute
   * names.
   */
  readonly external_ids: {
    readonly encyclopedia: string | null;
    readonly record_book: string | null;
  };
}

class CricketApi {
  constructor(private readonly client: BigBallSportsClient) {}

  matches(series?: string): Promise<ApiResponse<Match[]>> {
    return this.client.get<Match[]>('/v1/cricket/matches', {
      ...(series !== undefined ? { series } : {}),
    });
  }

  scorecard(matchId: string): Promise<ApiResponse<CricketScorecard>> {
    return this.client.get<CricketScorecard>(
      `/v1/cricket/matches/${encodeURIComponent(matchId)}/scorecard`,
    );
  }

  deliveries(
    matchId: string,
    options: { readonly stream?: number; readonly cursor?: string; readonly limit?: number } = {},
  ): Promise<ApiResponse<CricketDeliveriesPayload, CricketDeliveriesMeta>> {
    return this.client.get<CricketDeliveriesPayload, CricketDeliveriesMeta>(
      `/v1/cricket/matches/${encodeURIComponent(matchId)}/deliveries`,
      { ...options },
    );
  }

  /**
   * Live innings state (overs, runs, wickets, target, run rates).
   *
   * `data.state` is null and `meta.available` false whenever no state was
   * recorded — snapshots exist only for matches that were in progress during
   * an hourly ingest run, so that is the usual answer outside a live match.
   * Check `meta.live` before treating a snapshot as current.
   */
  matchState(
    matchId: string,
    innings?: number,
  ): Promise<ApiResponse<CricketMatchStatePayload, CricketMatchStateMeta>> {
    return this.client.get<CricketMatchStatePayload, CricketMatchStateMeta>(
      `/v1/cricket/matches/${encodeURIComponent(matchId)}/state`,
      { innings },
    );
  }
}

class CombatApi {
  constructor(private readonly client: BigBallSportsClient) {}

  cards(sport?: 'mma', date?: string): Promise<ApiResponse<MmaFightCard[]>>;
  cards(sport: 'boxing', date?: string): Promise<ApiResponse<BoxingFightCard[]>>;
  cards(
    sport: CombatSport = 'mma',
    date?: string,
  ): Promise<ApiResponse<MmaFightCard[] | BoxingFightCard[]>> {
    return this.client.get<MmaFightCard[] | BoxingFightCard[]>('/v1/fight-cards', {
      sport,
      ...(date !== undefined ? { date } : {}),
    });
  }

  bout(id: string, sport?: 'mma'): Promise<ApiResponse<MmaBout>>;
  bout(id: string, sport: 'boxing'): Promise<ApiResponse<BoxingBout>>;
  bout(id: string, sport: CombatSport = 'mma'): Promise<ApiResponse<MmaBout | BoxingBout>> {
    return this.client.get<MmaBout | BoxingBout>(`/v1/bouts/${encodeURIComponent(id)}`, {
      sport,
    });
  }

  athlete(id: string, sport: 'boxing'): Promise<ApiResponse<BoxingAthlete>>;
  athlete(id: string, sport?: 'mma'): Promise<ApiResponse<never>>;
  athlete(
    id: string,
    sport: CombatSport = 'mma',
  ): Promise<ApiResponse<BoxingAthlete> | ApiResponse<never>> {
    return this.client.get<BoxingAthlete>(`/v1/athletes/${encodeURIComponent(id)}`, { sport });
  }
}
