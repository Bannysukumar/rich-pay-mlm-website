"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFERENCE_COMPOUNDING_PLANS = void 0;
exports.compoundRoiPercentForDoubleInDays = compoundRoiPercentForDoubleInDays;
/**
 * Rich Compounding reference tiers (marketing grid). Fixed doc ids for idempotent admin seed.
 * ROI % approximates doubling principal over `durationDays` with daily compounding on balance.
 */
function compoundRoiPercentForDoubleInDays(durationDays) {
    const n = Math.max(1, durationDays);
    const r = Math.pow(2, 1 / n) - 1;
    return Math.round(r * 1e6) / 1e4;
}
const D = (amount, days, sortOrder) => ({
    id: `seed_compound_${amount}`,
    name: `Rich Compounding $${amount}`,
    amount,
    durationDays: days,
    maxRoiMultiplier: 2,
    sortOrder,
});
/** Default structure from spec: $500/30d … $100/50d, all 2× cap. */
exports.REFERENCE_COMPOUNDING_PLANS = [
    D(500, 30, 10),
    D(400, 35, 20),
    D(300, 40, 30),
    D(200, 45, 40),
    D(100, 50, 50),
];
//# sourceMappingURL=compoundingDefaults.js.map