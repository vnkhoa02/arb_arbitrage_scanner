import { Route } from 'src/dex/types/quote';
import { getBytes, getAddress, zeroPadValue, toBeHex, concat } from 'ethers';

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
  const pathBytes: Uint8Array<ArrayBufferLike>[] = [];

  for (let i = 0; i < route.length; i++) {
    const hop = route[i];

    // TokenIn: address -> 20 bytes
    const tokenInBytes = getBytes(getAddress(hop.tokenIn.address));
    pathBytes.push(getBytes(zeroPadValue(tokenInBytes, 20)));

    // Fee: number/string -> BigInt -> 3 bytes
    const feeHex = toBeHex(BigInt(hop.fee), 3); // Converts to 3-byte hex (e.g., 0x01f4 for 500)
    const feeBytes = getBytes(feeHex); // Convert hex string to bytes
    pathBytes.push(feeBytes);

    // TokenOut: only on last hop
    if (i === route.length - 1) {
      const tokenOutBytes = getBytes(getAddress(hop.tokenOut.address));
      pathBytes.push(getBytes(zeroPadValue(tokenOutBytes, 20)));
    }
  }

  return concat(pathBytes); // Returns hex string (e.g., '0x...')
}
