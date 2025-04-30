import { BigNumber, ethers, utils } from 'ethers'; // v5 import
import { Route } from 'src/dex/types/quote';

export function processRoute(routes: Route[][]): string[] {
  const processedRoutes = routes.map((route) => {
    const encoded = encodeRouteToPath(route);
    const amountIn = BigNumber.from(route[0].amountIn);
    const amountOutMinimum = 0;

    return ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'bytes'],
      [amountIn, amountOutMinimum, encoded],
    );
  });

  return processedRoutes;
}

function encodeRouteToPath(route: Route[]): string {
  const pathBytes: string[] = [];

  for (let i = 0; i < route.length; i++) {
    const hop = route[i];
    // TokenIn address (20 bytes)
    const tokenIn = utils.getAddress(hop.tokenIn.address);
    pathBytes.push(tokenIn.toLowerCase());

    // Fee: convert to 3-byte hex (padded left)
    const feeHex = utils.hexZeroPad(BigNumber.from(hop.fee).toHexString(), 3);
    pathBytes.push(feeHex);

    // TokenOut only at the end
    if (i === route.length - 1) {
      const tokenOut = utils.getAddress(hop.tokenOut.address);
      pathBytes.push(tokenOut.toLowerCase());
    }
  }

  const concatenated =
    '0x' + pathBytes.map((b) => b.replace(/^0x/, '')).join('');
  return concatenated;
}
