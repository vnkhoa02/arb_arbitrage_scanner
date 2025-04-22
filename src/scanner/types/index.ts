export interface IArbitrageProduct {
  spread: number;
  spreadInPct: number;
  feeBuy: number;
  feeSell: number;
  totalFee: number;
  feeInPct: number;
  isProfitable: boolean;
}
