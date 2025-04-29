import { BigNumber } from 'ethers';

export type ISimpleArbitrageParams = {
  forwardPaths: string[];
  backwardPaths: string[];
  borrowAmount: bigint;
} & ISimpleArbitrageTrade;

export interface ISimpleArbitrageTrade {
  tokenIn: string;
  amountIn: number;
  tokenOut: string;
}

export interface IFeeData {
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
}
