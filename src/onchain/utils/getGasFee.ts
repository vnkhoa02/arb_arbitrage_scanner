import axios from 'axios';
import { BigNumber, ethers } from 'ethers';
import { CHAIN_ID } from 'src/dex/config';
import { IFeeData } from '../types';
import { IBlockNativeGasData } from '../types/gasData';

export async function getFeeData(): Promise<IFeeData> {
  try {
    const url = `https://api.blocknative.com/gasprices/blockprices?chainid=${CHAIN_ID}`;
    const { data } = await axios.get<IBlockNativeGasData>(url);

    const blockPrice = data.blockPrices[0];
    const highConfidencePrice = blockPrice.estimatedPrices.find(
      (p: { confidence: number }) => p.confidence === 99,
    );

    if (!highConfidencePrice) {
      throw new Error('No 99% confidence gas price found.');
    }

    const maxFeePerGas = ethers.utils.parseUnits(
      highConfidencePrice.maxFeePerGas.toString(),
      'gwei',
    );

    let maxPriorityFeePerGas: BigNumber;
    if (highConfidencePrice.maxPriorityFeePerGas < 1e-6) {
      maxPriorityFeePerGas = BigNumber.from(0);
    } else {
      maxPriorityFeePerGas = ethers.utils.parseUnits(
        highConfidencePrice.maxPriorityFeePerGas.toString(),
        'gwei',
      );
    }

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  } catch (error: any) {
    console.error('Failed to fetch gas fee:', error.message);
    throw error;
  }
}

export function autoParseGasFee(value: BigNumber | string): BigNumber {
  if (BigNumber.isBigNumber(value)) {
    return value; // already BigNumber in wei
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num < 1000) {
    // Assume it’s gwei → parse to wei
    return ethers.utils.parseUnits(num.toString(), 'gwei');
  } else {
    // Assume it’s already wei → convert to BigNumber
    return BigNumber.from(Math.floor(num));
  }
}
