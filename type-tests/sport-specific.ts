import {
  BigBallSportsClient,
  type BoxingAthlete,
  type BoxingBout,
  type BoxingFightCard,
  type CricketMatchState,
  type CricketScorecard,
  type MmaBout,
  type MmaFightCard,
} from '../src/index.js';

declare const client: BigBallSportsClient;

const scorecard: CricketScorecard = (await client.cricket.scorecard('match-id')).data;
const inningsNumber: number | undefined = scorecard.innings[0]?.innings_number;

const state = await client.cricket.matchState('match-id', 2);
const snapshot: CricketMatchState | null = state.data.state;
const appliedInnings: number | null = state.meta.filters_applied.innings;

const mmaCards: MmaFightCard[] = (await client.combat.cards('mma')).data;
const boxingCards: BoxingFightCard[] = (await client.combat.cards('boxing')).data;
const mmaBout: MmaBout = (await client.combat.bout('bout-id', 'mma')).data;
const boxingBout: BoxingBout = (await client.combat.bout('bout-id', 'boxing')).data;
const boxer: BoxingAthlete = (await client.combat.athlete('athlete-id', 'boxing')).data;

void inningsNumber;
void snapshot;
void appliedInnings;
void mmaCards;
void boxingCards;
void mmaBout;
void boxingBout;
void boxer;
