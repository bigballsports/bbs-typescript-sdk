import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BigBallSportsClient, type HttpError, type Match } from './index.js';

describe('matches.list identifier workflow', () => {
  it('types and serves the canonical id needed by match-scoped calls', async () => {
    const runtimeMatch = {
      id: '7ad2b838-3e20-4ba6-a33c-b2186d28e197',
      sport: 'american_football',
      league: 'NFL',
      home: { id: 'home-id', name: 'Home', short_name: 'HOM', logo_url: null },
      away: { id: 'away-id', name: 'Away', short_name: 'AWY', logo_url: null },
      kickoff_utc: '2026-09-10T00:20:00.000Z',
      status: 'scheduled',
      score: null,
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [runtimeMatch],
          meta: {
            source: 'stored',
            confidence: 1,
            cached: false,
            cache_age_ms: 0,
            request_id: 'req-1',
          },
          error: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl,
    });

    const response = await client.matches.list({ sport: 'american_football', league: 'nfl' });
    const match: Match = response.data[0]!;

    expect(match.id).toBe(runtimeMatch.id);
    expect(match.home.id).toBe('home-id');
    expect(match.kickoff_utc).toBe(runtimeMatch.kickoff_utc);
  });
});

describe('measured response metadata', () => {
  it('does not invent confidence or cache age on stored match lists', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [],
          meta: { source: 'stored', cached: false, request_id: 'req-stored' },
          error: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl,
    });

    const response = await client.matches.list({ sport: 'american_football' });
    expect(response.meta.confidence).toBeUndefined();
    expect(response.meta.cache_age_ms).toBeUndefined();
  });
});

describe('README match-id workflow', () => {
  it('discovers runtime IDs instead of teaching a fabricated placeholder', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(readme).not.toContain('m-123');
    expect(readme).toContain('matches.data[0]?.id');
    expect(readme).toContain('client.matches.get(matchId');
  });
});

describe('HTTP failure contract', () => {
  it('throws HttpError for a non-2xx JSON body without an API error envelope', async () => {
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: 'upstream unavailable' }), {
          status: 503,
          statusText: 'Service Unavailable',
        }),
    });

    await expect(client.matches.list({ sport: 'football' })).rejects.toMatchObject({
      name: 'HttpError',
      status: 503,
      body: { message: 'upstream unavailable' },
    });
  });

  it('preserves the API error message on a normal error envelope', async () => {
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: null,
            meta: { request_id: 'req-error' },
            error: { code: 'rate_limited', message: 'Slow down' },
          }),
          { status: 429 },
        ),
    });

    await expect(client.matches.list({ sport: 'football' })).rejects.toEqual(
      expect.objectContaining<HttpError>({ status: 429, message: 'Slow down' }),
    );
  });

  it('throws HttpError with the raw body when a response is not JSON', async () => {
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl: async () => new Response('bad gateway', { status: 502 }),
    });

    await expect(client.matches.list({ sport: 'football' })).rejects.toMatchObject({
      name: 'HttpError',
      status: 502,
      body: 'bad gateway',
    });
  });
});

describe('typed sport-specific helpers', () => {
  it('passes the opaque stream and cursor to cricket deliveries', async () => {
    let requested = '';
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify({
            data: { match_id: 'match-1', deliveries: [] },
            meta: {
              source: 'stored',
              cached: false,
              request_id: 'req-deliveries',
              available: true,
              count: 0,
              limit: 25,
              stream: 2,
              available_streams: [1, 2],
              next_cursor: null,
            },
            error: null,
          }),
          { status: 200 },
        );
      },
    });

    const response = await client.cricket.deliveries('match-1', {
      stream: 2,
      cursor: 'cursor-1',
      limit: 25,
    });
    const url = new URL(requested);
    expect(url.pathname).toBe('/v1/cricket/matches/match-1/deliveries');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      stream: '2',
      cursor: 'cursor-1',
      limit: '25',
    });
    expect(response.meta.available_streams).toEqual([1, 2]);
  });

  it('passes an explicit innings selector to cricket match state', async () => {
    let requested = '';
    const client = new BigBallSportsClient('test-key', {
      baseUrl: 'https://example.test',
      fetchImpl: async (input) => {
        requested = String(input);
        return new Response(
          JSON.stringify({
            data: { match_id: 'match-1', state: null },
            meta: {
              source: 'stored',
              cached: false,
              request_id: 'req-state',
              available: false,
              filters_applied: { innings: 2 },
              live: false,
              match_status: 'finished',
            },
            error: null,
          }),
          { status: 200 },
        );
      },
    });

    const response = await client.cricket.matchState('match-1', 2);
    expect(new URL(requested).searchParams.get('innings')).toBe('2');
    expect(response.meta.filters_applied.innings).toBe(2);
  });
});
