export interface ArbPathResult {
  profit: number; // in USDT
  profitPct: number; // % relative to USDT spent
  buyLabel: string; // e.g. "Low"
  sellLabel: string; // e.g. "High"
  buyFee: number; // basis points
  sellFee: number; // basis points
  buyPrice: number; // USDT per tokenIn
  sellPrice: number; // USDT per tokenIn
  totalFeePct: number; // swapFees + flashLoanFee (decimal, e.g. 0.005)
}
