export const safeStringtify = (obj: any) => {
  return JSON.stringify(obj, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
};
