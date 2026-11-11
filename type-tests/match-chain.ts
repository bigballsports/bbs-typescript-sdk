import { BigBallSportsClient, type Match, type ResponseMeta } from '../src/index.js';

declare const client: BigBallSportsClient;
const listed = await client.matches.list({ sport: 'american_football', league: 'nfl', limit: 1 });
const match: Match | undefined = listed.data[0];

if (match) {
  const id: string = match.id;
  await client.matches.get(id, ['scores'], match.sport);
}

declare const meta: ResponseMeta;
const confidence: number | undefined = meta.confidence;
const cacheAgeMs: number | undefined = meta.cache_age_ms;
void confidence;
void cacheAgeMs;
