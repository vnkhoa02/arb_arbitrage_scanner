import { tokens } from '../constants/tokens';

export function getTokenLocalInfo(address: string) {
  const token = tokens.find(
    (t) => t.address.toLowerCase() == address.toLowerCase(),
  );
  return token;
}
