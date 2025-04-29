import { BigNumber } from 'ethers';

export type ISimpleArbitrageParams = {
  forwardPath: string;
  forwardOutMin?: bigint;
  backwardPath: string;
  backwardOutMin?: bigint;
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
