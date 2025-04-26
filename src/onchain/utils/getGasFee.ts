import axios from 'axios';
import { BigNumber, ethers } from 'ethers';

export async function getGasFee(gasEstimate: BigNumber = BigNumber.from(0)) {
  try {
    const url = 'https://api.blocknative.com/gasprices/blockprices?chainid=1';
    const { data } = await axios.get(url);

    const blockPrice = data.blockPrices[0];
    const highConfidencePrice = blockPrice.estimatedPrices.find(
      (p: { confidence: number }) => p.confidence === 99,
    );

    if (!highConfidencePrice) {
      throw new Error('No 99% confidence gas price found.');
    }

    // Convert to BigNumber
    const maxFeePerGas = ethers.utils.parseUnits(
      highConfidencePrice.maxFeePerGas.toString(),
      'gwei',
    );
    const maxPriorityFeePerGas = ethers.utils.parseUnits(
      highConfidencePrice.maxPriorityFeePerGas.toString(),
      'gwei',
    );

    // If gasEstimate is provided, calculate total estimated fee
    const estimatedFeeWei = gasEstimate.mul(maxFeePerGas);
    const estimatedFeeEth = ethers.utils
      .formatEther(estimatedFeeWei)
      .toString();

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      estimatedFeeEth,
    };
  } catch (error: any) {
    console.error('Failed to fetch gas fee:', error.message);
    throw error;
  }
}
