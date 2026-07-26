import { calculateShortRating } from '../lib/shortCheckScoring';
import { ExtractedData } from '../lib/shortCheckTypes';
import { T } from '../lib/config/thresholds';
import { normalizeShareCount } from '../lib/normalizeShares';

describe('normalizeShareCount', () => {
    it('treats values under 1000 as millions', () => {
        expect(normalizeShareCount(5)).toBe(5_000_000);
        expect(normalizeShareCount(2_000_000)).toBe(2_000_000);
    });
});

describe('calculateShortRating', () => {
    const baseData: ExtractedData = {
        ticker: 'TEST',
        confidence: 1.0,
        newsStatus: 'none',
        recentNews: 'None',
        borrowAvailable: true,
        hasActualDebtData: true,
        debt: 1_000_000,
        priceSpikePct: 40,
        outstandingShares3YearsAgo: 10_000_000,
    };

    it('should calculate a high score for a high-risk stock', () => {
        const highRiskData: ExtractedData = {
            ...baseData,
            cashRunway: 3,
            quarterlyBurnRate: -2000000,
            cashOnHand: 2000000,
            atmShelfStatus: 'ATM Active',
            outstandingShares: 50000000,
            float: 40000000,
            institutionalOwnership: 5,
            shortInterest: 2,
            marketCap: 30000000,
        };
        const result = calculateShortRating(highRiskData, { score: 80, spikeCount: 5 });
        expect(result.rating).toBeGreaterThan(70);
        expect(result.rating).toBeLessThanOrEqual(100);
        expect(result.category).toBe('High-Priority Short Candidate');
        expect(result.dataCompleteness).toBeGreaterThanOrEqual(T.dataQuality.minCompleteness);
    });

    it('should calculate a low score for a low-risk stock', () => {
        const lowRiskData: ExtractedData = {
            ...baseData,
            cashRunway: 36,
            quarterlyBurnRate: -1000000,
            cashOnHand: 12000000,
            atmShelfStatus: 'None',
            outstandingShares: 20000000,
            float: 18000000,
            institutionalOwnership: 40,
            shortInterest: 20,
            marketCap: 40_000_000,
        };

        const result = calculateShortRating(lowRiskData, { score: 30, spikeCount: 4 });
        expect(result.category).toBe('No-Trade');
        expect(result.walkAwayFlags.some(f => f.includes('Droppiness') || f.includes('Cash runway'))).toBe(true);
    });

    it('should handle missing data gracefully without awarding max defaults', () => {
        const missingData: ExtractedData = {
            ticker: 'MISS',
            confidence: 1.0,
        };

        const result = calculateShortRating(missingData);
        expect(result.rating).toBeDefined();
        expect(result.scoreBreakdown.newsCatalyst).toBe(0);
        expect(result.scoreBreakdown.shortInterest).toBe(0);
        expect(result.scoreBreakdown.institutionalOwnership).toBe(0);
        expect(result.dataCompleteness).toBeLessThan(T.dataQuality.minCompleteness);
        expect(result.category).toBe('No-Trade');
    });

    it('should trigger walk-away flags for positive cash flow', () => {
        const positiveCashFlowData: ExtractedData = {
            ...baseData,
            quarterlyBurnRate: 500000,
            cashRunway: 3,
            marketCap: 20_000_000,
            float: 10_000_000,
            atmShelfStatus: 'ATM Active',
            institutionalOwnership: 5,
            shortInterest: 2,
        };

        const result = calculateShortRating(positiveCashFlowData, { score: 80, spikeCount: 5 });
        expect(result.walkAwayFlags).toContain('Positive cash flow');
        expect(result.category).toBe('No-Trade');
    });

    it('should respect DT tags for Offering Ability', () => {
        const dtRedData: ExtractedData = {
            ...baseData,
            atmShelfStatus: 'dt:Red',
            float: 10_000_000,
            marketCap: 20_000_000,
        };
        const resultRed = calculateShortRating(dtRedData, { score: 80, spikeCount: 5 });
        expect(resultRed.scoreBreakdown.offeringAbility).toBeGreaterThan(0);

        const dtGreenData: ExtractedData = {
            ...baseData,
            atmShelfStatus: 'dt:Green',
            float: 10_000_000,
            marketCap: 20_000_000,
        };
        const resultGreen = calculateShortRating(dtGreenData, { score: 80, spikeCount: 5 });
        expect(resultGreen.scoreBreakdown.offeringAbility).toBeLessThan(0);
    });

    it('A1: QURE-profile low droppiness with enough spikes is No-Trade', () => {
        const qureLike: ExtractedData = {
            ...baseData,
            ticker: 'QURE',
            cashRunway: 4,
            quarterlyBurnRate: -2_000_000,
            cashOnHand: 3_000_000,
            atmShelfStatus: 'ATM Active',
            outstandingShares: 50_000_000,
            float: 40_000_000,
            institutionalOwnership: 5,
            shortInterest: 2,
            marketCap: 30_000_000,
        };
        const result = calculateShortRating(qureLike, { score: 0, spikeCount: 4 });
        expect(result.category).toBe('No-Trade');
        expect(result.walkAwayFlags.some(f => f.includes('Droppiness'))).toBe(true);
        expect(result.rating).toBeLessThanOrEqual(100);
    });

    it('A2: spikeCount < 3 surfaces UNVERIFIED and caps category', () => {
        const data: ExtractedData = {
            ...baseData,
            cashRunway: 3,
            quarterlyBurnRate: -2_000_000,
            cashOnHand: 2_000_000,
            atmShelfStatus: 'ATM Active',
            outstandingShares: 50_000_000,
            float: 40_000_000,
            institutionalOwnership: 5,
            shortInterest: 2,
            marketCap: 30_000_000,
        };
        const result = calculateShortRating(data, { score: 80, spikeCount: 2 });
        expect(result.droppinessStatus).toBe('UNVERIFIED');
        expect(result.scoreBreakdown.droppiness).toBe(0);
        expect(result.category).not.toBe('High-Priority Short Candidate');
        expect(result.category).not.toBe('Moderate Short Candidate');
    });

    it('A3: scalp override no longer bypasses walk-aways', () => {
        const scalpLike: ExtractedData = {
            ...baseData,
            cashRunway: 2,
            quarterlyBurnRate: -2_000_000,
            cashOnHand: 1_000_000,
            priceSpikePct: 150,
            marketCap: 80_000_000, // above T.marketCap.max → walk-away
            atmShelfStatus: 'ATM Active',
            float: 5_000_000,
            institutionalOwnership: 5,
            shortInterest: 2,
        };
        const result = calculateShortRating(scalpLike, { score: 80, spikeCount: 5 });
        expect(result.category).toBe('No-Trade');
        expect(result.walkAwayFlags.some(f => f.includes('Market Cap'))).toBe(true);
    });

    it('A4: float stored as millions still triggers TRAP_RISK walk-away', () => {
        const data: ExtractedData = {
            ...baseData,
            float: 0.9, // 0.9M shares
            atmShelfStatus: 'dt:Green',
            cashRunway: 4,
            quarterlyBurnRate: -2_000_000,
            cashOnHand: 3_000_000,
            outstandingShares: 5,
            institutionalOwnership: 5,
            shortInterest: 2,
            marketCap: 10_000_000,
        };
        const result = calculateShortRating(data, { score: 80, spikeCount: 5 });
        expect(result.walkAwayFlags.some(f => f.includes('TRAP_RISK'))).toBe(true);
        expect(result.category).toBe('No-Trade');
        expect(result.alertLabels.some(a => a.label === 'TRAP_RISK')).toBe(true);
    });

    it('A6: borrow unavailable is a walk-away', () => {
        const data: ExtractedData = {
            ...baseData,
            borrowAvailable: false,
            cashRunway: 3,
            quarterlyBurnRate: -2_000_000,
            cashOnHand: 2_000_000,
            atmShelfStatus: 'ATM Active',
            float: 40_000_000,
            outstandingShares: 50_000_000,
            institutionalOwnership: 5,
            shortInterest: 2,
            marketCap: 30_000_000,
        };
        const result = calculateShortRating(data, { score: 80, spikeCount: 5 });
        expect(result.walkAwayFlags).toContain('Borrow unavailable');
        expect(result.category).toBe('No-Trade');
    });
});
