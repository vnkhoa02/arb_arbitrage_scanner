import { BigNumber, utils } from 'ethers'; // v5 import
import { Route } from 'src/dex/types/quote';

export function pickBestRoute(routes: Route[][]): {
  route: Route[];
  encoded: string;
} {
  const best = routes.reduce((best, current) => {
    const currentOut = Number(current.at(-1)?.amountOut ?? 0);
    const bestOut = Number(best.at(-1)?.amountOut ?? 0);
    return currentOut > bestOut ? current : best;
  }, routes[0]);

  const encoded = encodeRouteToPath(best);
  return { route: best, encoded };
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

export function getUniqueToken0Ids(pools: any[]): string[] {
  const uniqueIds = new Set<string>();
  for (const pool of pools) {
    uniqueIds.add(pool.token0.id);
  }
  return Array.from(uniqueIds);
}
