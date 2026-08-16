import type { Commit } from './types';

export interface LaidOutCommit extends Commit {
  lane: number;
}

/**
 * Assign lanes to commits in topological order (newest first),
 * Obsidian-style: each active branch gets its own lane; a lane is freed
 * when its commit is rendered and all parents are accounted for.
 */
export function layoutGraph(commits: Omit<Commit, 'lane'>[]): LaidOutCommit[] {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  // count children per commit
  const childCount = new Map<string, number>();
  for (const c of commits) {
    for (const p of c.parents) childCount.set(p, (childCount.get(p) ?? 0) + 1);
  }

  // active lanes: lane -> hash expected next
  const laneOf = new Map<string, number>();
  const freeLanes: number[] = [];
  const result: LaidOutCommit[] = [];

  const takeLane = (): number => (freeLanes.length ? freeLanes.pop()! : laneOf.size + freeLanes.length);

  let nextNewLane = 0;
  const allocLane = (): number => {
    if (freeLanes.length) return freeLanes.pop()!;
    return nextNewLane++;
  };

  for (const c of commits) {
    let lane = laneOf.get(c.hash);
    if (lane === undefined) {
      lane = allocLane();
    } else {
      laneOf.delete(c.hash);
      // reuse the lane for the first parent, free it temporarily
    }
    result.push({ ...c, lane });

    if (c.parents.length === 0) {
      freeLanes.push(lane);
      freeLanes.sort((a, b) => b - a);
      continue;
    }
    // first parent continues on this lane
    const first = c.parents[0];
    if (!byHash.has(first)) continue; // truncated history
    if (!laneOf.has(first)) laneOf.set(first, lane);
    // extra parents (merge) get new lanes unless already present
    for (const p of c.parents.slice(1)) {
      if (!byHash.has(p)) continue;
      if (!laneOf.has(p)) laneOf.set(p, allocLane());
    }
    // if first parent already had another lane (child counted elsewhere) free ours
    // detect: laneOf.get(first) !== lane shouldn't happen due to check above
  }

  return result;
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
