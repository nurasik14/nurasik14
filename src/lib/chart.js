// "Best reward so far" only changes at a checkpoint, so read it as a step function.
export const valueAt = (points, x) => {
  let v = null;
  for (const [px, py] of points) if (px <= x) v = py;
  return v;
};

export const stepPath = (points, sx, sy) =>
  points.reduce((d, [x, y], i) => (i ? `${d}H${sx(x)}V${sy(y)}` : `M${sx(x)},${sy(y)}`), '');
