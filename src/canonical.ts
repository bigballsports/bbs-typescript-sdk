/**
 * Big Balls Sports canonical data contract — SDK mirror.
 *
 * These types are a verbatim duplicate of the server's canonical type module.
 * The SDK is published as a zero-dependency package, so it can't import
 * from the workspace at runtime — but drift between this file and the
 * server's canonical schema would silently break customer apps.
 *
 * A drift-prevention test, kept alongside the API rather than in this
 * published repository, fails the build when this file diverges from the
 * server's canonical types.
 *
 * Three contract invariants (the same three the published data contract states):
 *
 *   1. Every `id` field is a BigBalls canonical id matching
 *      `^bb_<entity>_[a-z0-9]+$`. Vendor IDs are translated upstream.
 *   2. Every status / market / method / event-type field is one of the
 *      enumerated string literals declared below. Vendor strings are
 *      never returned.
 *   3. There is no `unknown` / `Record<string, unknown>` in any return
 *      type. If you see one, it's a bug.
 */

// ---------------------------------------------------------------------------
// Enumerated terminology
// ---------------------------------------------------------------------------

export type SportType =
  | 'football'
  | 'basketball'
  | 'baseball'
  | 'ice_hockey'
  | 'cricket'
  | 'mma'
  | 'boxing'
  | 'formula1'
  | 'american_football';

export type CanonicalMatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'suspended';

export type CanonicalEventType =
  | 'period_start'
  | 'period_end'
  | 'final'
  | 'goal'
  | 'own_goal'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'card_yellow'
  | 'card_red'
  | 'substitution'
  | 'home_run'
  | 'strikeout'
  | 'walk'
  | 'rbi'
  | 'three_pointer'
  | 'free_throw_made'
  | 'rebound'
  | 'shot_on_goal'
  | 'power_play_goal'
  | 'touchdown'
  | 'field_goal'
  | 'turnover'
  | 'over_complete'
  | 'wicket'
  | 'boundary_four'
  | 'boundary_six'
  | 'knockdown'
  | 'submission_attempt'
  | 'other';

export type CanonicalOddsMarket =
  | 'moneyline'
  | 'spread'
  | 'total'
  | 'btts'
  | 'draw_no_bet'
  | 'double_chance';

export type CanonicalSelectionName =
  | 'home'
  | 'away'
  | 'draw'
  | 'over'
  | 'under'
  | 'yes'
  | 'no'
  | 'home_or_draw'
  | 'away_or_draw'
  | 'home_or_away';

export type CanonicalMetricName =
  | 'goals'
  | 'assists'
  | 'shots'
  | 'shots_on_target'
  | 'possession_percent'
  | 'passes'
  | 'pass_accuracy_percent'
  | 'corners'
  | 'fouls'
  | 'offsides'
  | 'cards_yellow'
  | 'cards_red'
  | 'saves'
  | 'xg'
  | 'progressive_passes'
  | 'pressures'
  | 'tackles'
  | 'interceptions'
  | 'points'
  | 'rebounds'
  | 'three_pointers_made'
  | 'three_pointers_attempted'
  | 'free_throws_made'
  | 'free_throws_attempted'
  | 'home_runs'
  | 'rbi'
  | 'strikeouts'
  | 'walks'
  | 'batting_average'
  | 'significant_strikes_landed'
  | 'significant_strikes_attempted'
  | 'takedowns_landed'
  | 'takedowns_attempted'
  | 'knockdowns'
  | 'control_time_seconds'
  | 'runs'
  | 'wickets'
  | 'overs'
  | 'fours'
  | 'sixes'
  | 'strike_rate'
  | 'economy'
  | 'market_value_eur';

export type CanonicalMetricUnit = 'count' | 'percent' | 'seconds' | 'meters' | 'unit';

export type CanonicalFightMethod =
  | 'ko'
  | 'tko'
  | 'submission'
  | 'unanimous_decision'
  | 'split_decision'
  | 'majority_decision'
  | 'technical_decision'
  | 'disqualification'
  | 'no_contest'
  | 'draw';

export type CanonicalCricketFormat = 't10' | 't20' | 'odi' | 'test' | 'first_class';

export type CanonicalFightStance = 'orthodox' | 'southpaw' | 'switch';

export type CanonicalSessionType = 'practice' | 'qualifying' | 'sprint' | 'race';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface CanonicalEntity {
  /** `bb_<entity>_<10–32 lowercase base32 chars>`. Stable across crashes. */
  readonly id: string;
}

export interface CanonicalTeam extends CanonicalEntity {
  readonly sport: SportType;
  readonly name: string;
  readonly short_name?: string;
  readonly country?: string;
  readonly founded_year?: number;
}

export interface CanonicalPlayer extends CanonicalEntity {
  readonly sport: SportType;
  readonly full_name: string;
  readonly display_name: string;
  readonly current_team_id?: string;
  readonly position?: string;
  readonly shirt_number?: number;
  readonly date_of_birth?: string;
  readonly nationality?: string;
  readonly height_cm?: number;
  readonly weight_kg?: number;
}

export interface CanonicalLeague extends CanonicalEntity {
  readonly sport: SportType;
  readonly name: string;
  readonly country?: string;
}

export interface CanonicalPeriodScore {
  readonly period: number;
  readonly label: string;
  readonly home: number;
  readonly away: number;
}

export interface CanonicalClock {
  readonly elapsed_seconds: number;
  readonly period: number;
  readonly added_seconds?: number;
}

export interface CanonicalScore {
  readonly match_id: string;
  readonly home: number | null;
  readonly away: number | null;
  readonly status: CanonicalMatchStatus;
  readonly period_scores?: readonly CanonicalPeriodScore[];
  readonly clock?: CanonicalClock;
  readonly updated_at: string;
}

export interface CanonicalMatchSide {
  readonly team_id: string;
  readonly team_name: string;
}

export interface CanonicalMatch extends CanonicalEntity {
  readonly sport: SportType;
  readonly league_id: string;
  readonly season?: string;
  readonly start_time: string;
  readonly status: CanonicalMatchStatus;
  readonly home: CanonicalMatchSide;
  readonly away: CanonicalMatchSide;
  readonly venue?: string;
  readonly score?: CanonicalScore;
  readonly updated_at: string;
}

export interface CanonicalSelection {
  readonly name: CanonicalSelectionName;
  readonly decimal_odds: number;
  readonly line?: number;
}

export interface CanonicalOdds {
  readonly match_id: string;
  readonly market: CanonicalOddsMarket;
  readonly selections: readonly CanonicalSelection[];
  readonly updated_at: string;
}

export interface CanonicalStat {
  readonly match_id?: string;
  readonly team_id?: string;
  readonly player_id?: string;
  readonly metric: CanonicalMetricName;
  readonly value: number;
  readonly unit: CanonicalMetricUnit;
  readonly period?: number;
  readonly updated_at: string;
}

export interface CanonicalEvent extends CanonicalEntity {
  readonly match_id: string;
  readonly sequence: number;
  readonly clock: CanonicalClock;
  readonly type: CanonicalEventType;
  readonly team_id?: string;
  readonly player_id?: string;
  readonly related_player_id?: string;
  readonly description?: string;
}

export interface CanonicalStandingRow {
  readonly position: number;
  readonly team_id: string;
  readonly team_name: string;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goals_for: number;
  readonly goals_against: number;
  readonly goal_difference: number;
  readonly points: number;
}

export interface CanonicalStandings {
  readonly league_id: string;
  readonly season: string;
  readonly rows: readonly CanonicalStandingRow[];
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Cricket extension
// ---------------------------------------------------------------------------

export interface CanonicalCricketInnings {
  readonly number: 1 | 2 | 3 | 4;
  readonly batting_team_id: string;
  readonly runs: number;
  readonly wickets: number;
  readonly overs: number;
  readonly declared: boolean;
}

export interface CanonicalCricketMatch extends CanonicalMatch {
  readonly format: CanonicalCricketFormat;
  readonly innings: readonly CanonicalCricketInnings[];
  readonly result_text?: string;
}

// ---------------------------------------------------------------------------
// Combat extension
// ---------------------------------------------------------------------------

export interface CanonicalFighterRecord {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly no_contests: number;
}

export interface CanonicalFighter extends CanonicalPlayer {
  readonly record: CanonicalFighterRecord;
  readonly stance?: CanonicalFightStance;
  readonly reach_cm?: number;
}

export interface CanonicalBoutResult {
  readonly method: CanonicalFightMethod;
  readonly round: number;
  readonly time_seconds: number;
  readonly winner_fighter_id?: string;
}

export interface CanonicalBout extends CanonicalEntity {
  readonly card_id: string;
  readonly order: number;
  readonly weight_class: string;
  readonly scheduled_rounds: number;
  readonly fighter_a_id: string;
  readonly fighter_b_id: string;
  readonly result?: CanonicalBoutResult;
}

export interface CanonicalFightCard extends CanonicalEntity {
  readonly sport: 'mma' | 'boxing';
  readonly name: string;
  readonly date: string;
  readonly venue?: string;
  readonly bouts: readonly CanonicalBout[];
  readonly status: CanonicalMatchStatus;
}

// ---------------------------------------------------------------------------
// Motorsport (Formula 1)
// ---------------------------------------------------------------------------

export interface CanonicalSessionResult {
  readonly position: number;
  readonly driver_id: string;
  readonly team_id?: string;
  readonly best_lap_seconds?: number;
  readonly gap_to_leader_seconds?: number;
  readonly laps_completed?: number;
  readonly dnf: boolean;
}

export interface CanonicalSession extends CanonicalEntity {
  readonly sport: 'formula1';
  readonly session_type: CanonicalSessionType;
  readonly league_id: string;
  readonly season?: string;
  readonly circuit_id: string;
  readonly start_time: string;
  readonly status: CanonicalMatchStatus;
  readonly results: readonly CanonicalSessionResult[];
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// FieldKey to canonical payload map. Mirrors the server's CanonicalForField.
// ---------------------------------------------------------------------------

export type FieldKey =
  | 'scores'
  | 'odds'
  | 'lineups'
  | 'players'
  | 'stats'
  | 'historical'
  | 'injuries'
  | 'transfers'
  | 'standings'
  | 'events'
  | 'player_market_value'
  | 'sessions';

export type CanonicalForField = {
  scores: readonly CanonicalScore[];
  odds: readonly CanonicalOdds[];
  lineups: readonly CanonicalPlayer[];
  players: readonly CanonicalPlayer[];
  stats: readonly CanonicalStat[];
  historical: readonly CanonicalMatch[];
  injuries: readonly CanonicalPlayer[];
  transfers: readonly CanonicalPlayer[];
  standings: CanonicalStandings;
  events: readonly CanonicalEvent[];
  player_market_value: readonly CanonicalStat[];
  sessions: readonly CanonicalSession[];
};

// ---------------------------------------------------------------------------
// Frozen enum lists — needed by the drift test so it can iterate.
// ---------------------------------------------------------------------------

export const ALL_SPORTS: readonly SportType[] = [
  'football',
  'basketball',
  'baseball',
  'ice_hockey',
  'cricket',
  'mma',
  'boxing',
  'formula1',
  'american_football',
] as const;

export const ALL_MATCH_STATUSES: readonly CanonicalMatchStatus[] = [
  'scheduled',
  'in_progress',
  'finished',
  'postponed',
  'cancelled',
  'suspended',
] as const;

export const ALL_ODDS_MARKETS: readonly CanonicalOddsMarket[] = [
  'moneyline',
  'spread',
  'total',
  'btts',
  'draw_no_bet',
  'double_chance',
] as const;

export const ALL_SELECTION_NAMES: readonly CanonicalSelectionName[] = [
  'home',
  'away',
  'draw',
  'over',
  'under',
  'yes',
  'no',
  'home_or_draw',
  'away_or_draw',
  'home_or_away',
] as const;

export const ALL_FIGHT_METHODS: readonly CanonicalFightMethod[] = [
  'ko',
  'tko',
  'submission',
  'unanimous_decision',
  'split_decision',
  'majority_decision',
  'technical_decision',
  'disqualification',
  'no_contest',
  'draw',
] as const;

export const ALL_CRICKET_FORMATS: readonly CanonicalCricketFormat[] = [
  't10',
  't20',
  'odi',
  'test',
  'first_class',
] as const;

export const ALL_FIELD_KEYS: readonly FieldKey[] = [
  'scores',
  'odds',
  'lineups',
  'players',
  'stats',
  'historical',
  'injuries',
  'transfers',
  'standings',
  'events',
  'player_market_value',
  'sessions',
] as const;

export const ALL_SESSION_TYPES: readonly CanonicalSessionType[] = [
  'practice',
  'qualifying',
  'sprint',
  'race',
] as const;
