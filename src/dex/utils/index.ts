import { JoinedPool, Pool } from '../types/pools';

// a -> x -> b => Get X
export function joinCommonPools(a_x: Pool[], x_b: Pool[]): JoinedPool[] {
  const joined: JoinedPool[] = [];

  const wethMap = new Map<string, Pool>();
  for (const pool of x_b) {
    wethMap.set(pool.token0.id.toLowerCase(), pool);
  }

  for (const pool of a_x) {
    const token1Id = pool.token1.id.toLowerCase();
    if (wethMap.has(token1Id)) {
      joined.push({
        intermediateToken: pool.token1,
        aPool: pool,
        bPool: wethMap.get(token1Id)!,
      });
    }
  }

  return joined;
}

export function findCommonXTokens(a_x: Pool[], x_b: Pool[]): string[] {
  const token1Set = new Set(a_x.map((p) => p.token1.id.toLowerCase()));
  const token0Set = new Set(x_b.map((p) => p.token0.id.toLowerCase()));

  const common = [...token1Set].filter((id) => token0Set.has(id));
  return common;
}
