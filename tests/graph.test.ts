import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../src/shared/graph';

function commit(hash: string, parents: string[] = []) {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    author: 'T',
    email: 't@t',
    timestamp: 0,
    message: hash,
    refs: [] as string[],
  };
}

describe('layoutGraph', () => {
  it('handles empty history', () => {
    expect(layoutGraph([])).toEqual([]);
  });

  it('keeps linear history in lane 0', () => {
    const laid = layoutGraph([commit('c', ['b']), commit('b', ['a']), commit('a')]);
    expect(laid.map((c) => c.lane)).toEqual([0, 0, 0]);
  });

  it('puts a side branch in its own lane and merges back', () => {
    const laid = layoutGraph([
      commit('m', ['main2', 'feat']),
      commit('main2', ['main1']),
      commit('feat', ['main1']),
      commit('main1'),
    ]);
    const lane = Object.fromEntries(laid.map((c) => [c.hash, c.lane]));
    expect(lane.m).toBe(0);
    expect(lane.main2).toBe(0);
    expect(lane.feat).toBe(1);
    expect(lane.main1).toBe(0);
  });

  it('gives a second root its own lane', () => {
    const laid = layoutGraph([
      commit('c', ['b']),
      commit('other'),
      commit('b', ['a']),
      commit('a'),
    ]);
    const lane = Object.fromEntries(laid.map((c) => [c.hash, c.lane]));
    expect(lane.other).toBe(1);
    expect(lane.a).toBe(0);
  });

  it('reuses a lane once its branch is done', () => {
    const laid = layoutGraph([
      commit('c', ['b']),
      commit('r1'),
      commit('r2'),
      commit('b', ['a']),
      commit('a'),
    ]);
    const lane = Object.fromEntries(laid.map((c) => [c.hash, c.lane]));
    expect(lane.r1).toBe(1);
    expect(lane.r2).toBe(1); // r1 freed its lane, r2 takes it
    expect(Math.max(...laid.map((c) => c.lane))).toBe(1);
  });

  it('treats parents outside the list as truncated history', () => {
    const laid = layoutGraph([commit('b', ['missing']), commit('a', ['gone']]);
    expect(laid).toHaveLength(2);
    expect(laid.every((c) => c.lane >= 0)).toBe(true);
  });

  it('keeps live branches on distinct lanes', () => {
    const laid = layoutGraph([
      commit('f2', ['f1']),
      commit('m2', ['m1']),
      commit('f1', ['base']),
      commit('m1', ['base']),
      commit('base'),
    ]);
    const lane = Object.fromEntries(laid.map((c) => [c.hash, c.lane]));
    expect(lane.f2).not.toBe(lane.m2);
    expect(lane.base).toBe(lane.f1); // first child to reach base keeps its lane
  });
});
