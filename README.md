# @bigballsdata/sdk

Official TypeScript SDK for the Big Balls Sports Data API.

## Install

```bash
npm install @bigballsdata/sdk
```

## Quick start

```ts
import { BigBallSportsClient } from '@bigballsdata/sdk';

const client = new BigBallSportsClient('bbs_your_api_key');

const matches = await client.matches.list({
  sport: 'american_football',
  league: 'nfl',
  limit: 1,
});
const matchId = matches.data[0]?.id;
if (!matchId) throw new Error('No matching game found');

const live = await client.matches.get(matchId, ['scores', 'odds', 'lineups'], 'american_football');
console.log(live.data.scores, live.data.odds);
```

## WebSocket subscriptions

```ts
import { io } from 'socket.io-client';

const matches = await client.matches.list({
  sport: 'american_football',
  league: 'nfl',
  limit: 1,
});
const matchId = matches.data[0]?.id;
if (!matchId) throw new Error('No matching game found');

const unsubscribe = client.subscribe(
  `match:${matchId}`,
  (event) => console.log(event.type, event.data),
  { socketIo: io },
);

// later:
unsubscribe();
```

Zero runtime dependencies. `socket.io-client` is required only if you use
`subscribe()` — pass it in via `{ socketIo: io }`.

## Cricket and combat types

Sport-specific methods return concrete types, so you can work with scorecards,
live innings state, fight cards, bouts, and boxing athletes without casting:

```ts
const scorecard = await client.cricket.scorecard(matchId);
console.log(scorecard.data.innings[0]?.batting[0]?.runs);

const secondInnings = await client.cricket.matchState(matchId, 2);
console.log(secondInnings.data.state?.required_run_rate);

const boxingCards = await client.combat.cards('boxing');
console.log(boxingCards.data[0]?.bouts[0]?.result.method);
```

MMA athlete profiles are not loaded yet. `client.combat.athlete(id, 'mma')`
therefore has no successful data type and the API returns an error until that
surface is available.

## Errors

Every non-2xx response throws `HttpError`, including proxy or infrastructure
responses that do not use the normal API error envelope. The error includes
the HTTP `status` and parsed or raw response `body`:

```ts
import { HttpError } from '@bigballsdata/sdk';

try {
  await client.matches.get('missing-id');
} catch (error) {
  if (error instanceof HttpError) {
    console.error(error.status, error.body);
  }
}
```

## Generated route surface (`@bigballsdata/sdk/ops`) — prototype

The hand-written namespaces above reach 15 of the API's 163 documented
operations. The `ops` subpath is generated from the canonical OpenAPI contract
and reaches all 163:

```ts
import { BigBallSportsClient } from '@bigballsdata/sdk';
import { call, asErrorResponse } from '@bigballsdata/sdk/ops';

const client = new BigBallSportsClient('bbs_...');

const r = await call(client, 'getMatches', { sport: 'football', league: 'epl', limit: 3 });
r.data[0].home.name; // typed from the contract, not a cast

// Caller-supplied cancellation, joined to the client's internal timeout.
const ac = new AbortController();
await call(client, 'getMatches', { sport: 'basketball' }, { signal: ac.signal });

// The full error contract, narrowed without asserting.
try {
  await call(client, 'getMatchesById', { id: 'nope' });
} catch (e) {
  const err = asErrorResponse(e); // null if the body isn't the contract
  err?.suggested_fix;
  err?.docs_url;
  err?.support.email;
  err?.meta.request_id;
}
```

**Honest coverage:** all 163 operations are callable with fully typed requests.
**100 of 163 (61.3%)** have a response payload the spec types; the rest resolve
to `data: unknown` because the published OpenAPI contract declares no response schema for
them. Each operation carries `operations[name].responseTyped` so the gap is
readable, and the generator prints the ratio on every run.

The generated surface is rebuilt from the canonical contract before each SDK
release. You can inspect that contract at
[`https://bigballsdata.com/openapi.json`](https://bigballsdata.com/openapi.json).
