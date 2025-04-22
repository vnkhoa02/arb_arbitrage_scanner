import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers, toBigInt } from 'ethers';
import { provider } from './config';
import { DEX, STABLE_COIN, TOKENS } from './config/token';

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
   * Get the output amount for a given input amount and path using the Uniswap router.
   * @param amountIn The input amount.
   *  @param path The path of token addresses for the swap.
   */
  async getOutputAmount(amountIn: string, path: string[]) {
    const routerABI = [
      'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
    ];
    const router = new ethers.Contract(DEX.uniswap.router, routerABI, provider);
    const amountsOut = await router.getAmountsOut(amountIn, path);
    return amountsOut[1];
  }

  /**
   * Get a quote for a token swap using the Uniswap Quoter contract.
   * @param tokenIn The address of the input token.
   * @param tokenOut The address of the output token.
   * @param amountIn The amount of the input token.
   * @param fee The fee tier of the Uniswap pool (e.g., 500, 3000, 10000).
   * @param decimalOut The number of decimals for the output token (default is 6).
   * @returns The quoted amount of the output token.
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    feeAmount: string | number,
    decimalOut = 6,
  ) {
    try {
      const quoterABI = [
        'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)',
      ];
      const quoter = new ethers.Contract(
        DEX.uniswap.quoter,
        quoterABI,
        provider,
      );
      const amountInBigInt = ethers.parseUnits(amountIn, 18);
      const sqrtPriceLimitX96 = 0;

      const quotedAmount = await quoter.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        toBigInt(feeAmount),
        amountInBigInt,
        sqrtPriceLimitX96,
      );
      return ethers.formatUnits(quotedAmount, decimalOut);
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }

  async simpleArbitrage(
    _lowFee: number,
    _highFee: number,
    amountInEth: number,
  ) {
    const [lowFeeQuote, highFeeQuote] = await Promise.all([
      this.getQuote(
        TOKENS.WETH,
        STABLE_COIN.USDT,
        String(amountInEth),
        _lowFee,
      ),
      this.getQuote(
        TOKENS.WETH,
        STABLE_COIN.USDT,
        String(amountInEth),
        _highFee,
      ),
    ]);

    const priceLow = parseFloat(lowFeeQuote); // Quoting from _lowFee pool
    const priceHigh = parseFloat(highFeeQuote); // Quoting from _highFee pool
    const spread = priceLow - priceHigh;
    const spreadPct = (spread / priceHigh) * 100;

    // Correct Uniswap V2-style round trip fee
    const flashSwapFee = this.getFlashSwapUniswapV3Fee(
      TOKENS.WETH,
      STABLE_COIN.USDT,
    );

    const totalFeePct = flashSwapFee * 2 * 100; // Round trip fee in %

    // 🧾 Log Report
    console.log(`🧾 ${amountInEth} WETH → USDT`);
    console.log(`${_lowFee / 10000}% Pool: ${priceLow} USDT`);
    console.log(`${_highFee / 10000}% Pool: ${priceHigh} USDT`);
    console.log(`Spread: ${spread.toFixed(4)} USDT (${spreadPct.toFixed(4)}%)`);
    console.log(`Fees:   ${totalFeePct.toFixed(2)}%`);

    if (spreadPct > totalFeePct) {
      console.log('✅ Arbitrage possible!');
    } else {
      console.log('❌ No arbitrage (fees eat profit)');
    }
  }

  getFlashSwapUniswapV3Fee(tokenIn: string, tokenOut: string): number {
    const isTokenInWETH = tokenIn.toLowerCase() === TOKENS.WETH.toLowerCase();
    const isTokenOutWETH = tokenOut.toLowerCase() === TOKENS.WETH.toLowerCase();

    if (isTokenInWETH || isTokenOutWETH) {
      return 0.003; // 0.3% fee
    }

    // Neither is WETH → 2-hop through WETH
    return 0.006; // 0.6% fee
  }
}
