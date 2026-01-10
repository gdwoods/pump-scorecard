import { calculateShortRating } from '../lib/shortCheckScoring';
import { ExtractedData } from '../lib/shortCheckTypes';

describe('calculateShortRating', () => {
    const baseData: ExtractedData = {
        ticker: 'TEST',
        confidence: 1.0,
    };

    it('should calculate a high score for a high-risk stock', () => {
        const highRiskData: ExtractedData = {
            ...baseData,
            cashRunway: 3, // < 6 months -> +25 (Cash Need) + 15 (Cash Runway)
            quarterlyBurnRate: -2000000,
            cashOnHand: 2000000,
            atmShelfStatus: 'ATM Active', // Active dilution -> +25 (Offering Ability)
            outstandingShares: 50000000,
            float: 40000000, // High dilution ratio -> Red Overhead
            institutionalOwnership: 5, // < 10% -> +5
            shortInterest: 2, // < 3% -> +15
            marketCap: 30000000, // Microcap -> Risk indicator
        };
        // Pass droppiness separately as it's the second argument
        const result = calculateShortRating(highRiskData, 80);
        expect(result.rating).toBeGreaterThan(70);
        expect(result.category).toBe('High-Priority Short Candidate');
    });

    it('should calculate a low score for a low-risk stock', () => {
        const lowRiskData: ExtractedData = {
            ...baseData,
            cashRunway: 36, // > 24 months -> Low Cash Need (+5), Cash Runway (-10)
            quarterlyBurnRate: -1000000,
            cashOnHand: 12000000,
            atmShelfStatus: 'None', // Green Offering -> -30
            outstandingShares: 20000000,
            float: 18000000, // Low dilution -> Green Overhead
            institutionalOwnership: 40, // High ownership -> 0
            shortInterest: 20, // Moderate short interest -> +6
        };

        const result = calculateShortRating(lowRiskData, 30);
        expect(result.rating).toBeLessThan(40);
        // Category might be No-Trade due to walk-away flags (runway > 24)
        // or Speculative/No-Trade based on score
    });

    it('should handle missing data gracefully', () => {
        const missingData: ExtractedData = {
            ...baseData,
        };

        const result = calculateShortRating(missingData);
        expect(result.rating).toBeDefined();
        expect(result.scoreBreakdown).toBeDefined();
    });

    it('should trigger walk-away flags for positive cash flow', () => {
        const positiveCashFlowData: ExtractedData = {
            ...baseData,
            quarterlyBurnRate: 500000, // Positive cash flow
        };

        const result = calculateShortRating(positiveCashFlowData);
        expect(result.walkAwayFlags).toContain('Positive cash flow');
        expect(result.category).toBe('No-Trade');
    });

    it('should respect DT tags for Offering Ability', () => {
        const dtRedData: ExtractedData = {
            ...baseData,
            atmShelfStatus: 'dt:Red',
        };
        const resultRed = calculateShortRating(dtRedData);
        // Offering Ability should be high (Red)
        // Exact score depends on Overhead Supply, but it should be significant
        expect(resultRed.scoreBreakdown.offeringAbility).toBeGreaterThan(0);

        const dtGreenData: ExtractedData = {
            ...baseData,
            atmShelfStatus: 'dt:Green',
        };
        const resultGreen = calculateShortRating(dtGreenData);
        // Offering Ability should be low/negative (Green)
        expect(resultGreen.scoreBreakdown.offeringAbility).toBeLessThan(0);
    });
});
