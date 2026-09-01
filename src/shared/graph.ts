import type { Commit } from './types';

export interface LaidOutCommit extends Commit {
  lane: number;
}

// Newest-first in, one lane per commit out. The first parent keeps the
// lane, extra merge parents take the lowest free lane; a lane is freed
// once its commit has been placed.
export function layoutGraph(commits: Omit<Commit, 'lane'>[]): LaidOutCommit[] {
  const known = new Set(commits.map((c) => c.hash));
  const reserved = new Map<string, number>(); // hash -> lane a child promised it
  const free: number[] = [];
  let count = 0;
  const take = () => (free.length ? free.pop()! : count++);
  return commits.map((commit) => {
    const promised = reserved.get(commit.hash);
    const lane = promised ?? take();
    if (promised !== undefined) reserved.delete(commit.hash);
    const parents = commit.parents.filter((p) => known.has(p));
    if (parents.length === 0) {
      free.push(lane);
    } else {
      if (reserved.has(parents[0])) free.push(lane);
      else reserved.set(parents[0], lane);
      for (const p of parents.slice(1)) if (!reserved.has(p)) reserved.set(p, take());
    }
    free.sort((a, b) => b - a); // pop() takes the lowest lane
    return { ...commit, lane };
  });
}

/** Branch palette used by the graph renderer. */
export const LANE_COLORS = [
  '#c084fc', // violet
  '#4fd1c5', // teal
  '#f6ad55', // amber
  '#63b3ed', // sky
  '#f687b3', // pink
  '#68d391', // green
  '#f56565', // red
  '#ecc94b', // yellow
];
