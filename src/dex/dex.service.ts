import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers, toBigInt } from 'ethers';
import { provider } from './config';

const routerABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
];

@Injectable()
export class DexService {
  /**
   * Get basic information about a token using its address.
   * @param tokenAddress The address of the token contract.
   * @returns An object containing the token's name, symbol, decimals, and total supply.
   */
  async getTokenBasicInfo(tokenAddress: string) {
    try {
      const ERC20_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
      ];
      if (!ethers.isAddress(tokenAddress))
        throw new BadRequestException('Invalid token address');
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
      ]);

      return {
        name,
        symbol,
        decimals: toBigInt(decimals).toString(),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      throw new BadRequestException(
        `Error getting token info: ${error.message}`,
      );
    }
  }

  /**
   * Get the number of decimals for a given token address.
   * @param tokenAddress The address of the token contract.
   * @returns The number of decimals for the token.
   */

  async getTokenDecimals(tokenAddress: string) {
    const tokenInfo = await this.getTokenBasicInfo(tokenAddress);
    return tokenInfo.decimals;
  }

  /**
   * Get the output amount of a token swap using the Uniswap router.
   * @param routerAddr The address of the Uniswap router contract.
   * @param amountIn The input amount of the token to swap.
   * @param path The path of token addresses for the swap.
   * @returns The output amount of the token after the swap.
   */
  async getOutputAmount(
    routerAddr: string,
    amountIn: string,
    path: string[],
  ): Promise<bigint> {
    const router = new ethers.Contract(routerAddr, routerABI, provider);
    const amounts = await router.getAmountsOut(amountIn, path);
    return amounts[amounts.length - 1].toString();
  }
}
