// "Best reward so far" only changes at a checkpoint, so read it as a step function.
export const valueAt = (points, x) => {
  let v = null;
  for (const [px, py] of points) if (px <= x) v = py;
  return v;
};

// Drawn from the last point back to the first, so a dash pattern starts
// exactly at the endpoint dot instead of possibly ending in a gap.
export const stepPath = (points, sx, sy) => {
  const [lx, ly] = points.at(-1);
  let d = `M${sx(lx)},${sy(ly)}`;
  for (let i = points.length - 1; i > 0; i--) d += `V${sy(points[i - 1][1])}H${sx(points[i - 1][0])}`;
  return d;
};
