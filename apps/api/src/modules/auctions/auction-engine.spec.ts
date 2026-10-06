import {
  apply,
  EngineError,
  minimumBid,
  type EngineAction,
  type EngineAuction,
  type EngineBidder,
} from './auction-engine.js';

// Replays actions through the engine like the service does: one projection
// per bidder, auction price/leader/sequence carried between commands.
function run(actions: EngineAction[], startPrice = 200_000, step = 50_000) {
  let a: EngineAuction = {
    startPrice,
    step,
    currentPrice: null,
    leaderId: null,
    nextSequence: 1,
  };
  const bidders = new Map<string, EngineBidder>();
  const trace: [number, string][] = [];
  for (const action of actions) {
    const r = apply(a, [...bidders.values()], action);
    bidders.set(r.bidder.bidderId, r.bidder);
    a = { ...a, ...r };
    trace.push([r.currentPrice, r.leaderId]);
  }
  return { a, bidders, trace };
}
const reject = (actions: EngineAction[], last: EngineAction) => {
  try {
    run([...actions, last]);
  } catch (e) {
    return (e as EngineError).reason;
  }
  return null;
};
const manual = (bidderId: string, amount: number): EngineAction => ({
  kind: 'Manual',
  bidderId,
  amount,
});
const auto = (bidderId: string, max: number): EngineAction => ({
  kind: 'AutoSet',
  bidderId,
  max,
});
const off = (bidderId: string): EngineAction => ({
  kind: 'AutoDisable',
  bidderId,
});

describe('auction engine (FR-AU03–05)', () => {
  it('AC-AU03: A Auto400k, B 250/350/450k gives 200/300/400/450k', () => {
    const { trace } = run([
      auto('A', 400_000),
      manual('B', 250_000),
      manual('B', 350_000),
      manual('B', 450_000),
    ]);
    expect(trace).toEqual([
      [200_000, 'A'],
      [300_000, 'A'],
      [400_000, 'A'],
      [450_000, 'B'],
    ]);
  });

  it('AC-AU04: one manual 300k stays 300k; one Auto stays at start', () => {
    expect(run([manual('A', 300_000)]).trace).toEqual([[300_000, 'A']]);
    expect(run([auto('A', 400_000)]).trace).toEqual([[200_000, 'A']]);
  });

  it('AC-AU04: a manual bid may jump several steps and is not lowered', () => {
    const { trace } = run([auto('A', 300_000), manual('B', 600_000)]);
    expect(trace.at(-1)).toEqual([600_000, 'B']);
  });

  it('AC-AU05: equal Auto ceilings go to whoever reached them first', () => {
    const { trace } = run([auto('A', 400_000), auto('B', 400_000)]);
    expect(trace.at(-1)).toEqual([400_000, 'A']);
    const later = run([
      manual('B', 250_000),
      auto('A', 400_000),
      auto('B', 400_000),
    ]);
    expect(later.trace.at(-1)).toEqual([400_000, 'A']);
  });

  it('a manual bid equal to the leading ceiling keeps the earlier leader', () => {
    expect(
      run([auto('A', 400_000), manual('B', 400_000)]).trace.at(-1),
    ).toEqual([400_000, 'A']);
  });

  it('a higher Auto beats a lower one by one step, capped at its ceiling', () => {
    expect(run([auto('A', 400_000), auto('B', 700_000)]).trace.at(-1)).toEqual([
      450_000,
      'B',
    ]);
    expect(run([auto('A', 400_000), auto('B', 450_000)]).trace.at(-1)).toEqual([
      450_000,
      'B',
    ]);
  });

  it('AC-AU06: off-grid, above 1m, below minimum and lowering are rejected', () => {
    expect(reject([], manual('A', 225_000))).toBe('OffGrid');
    expect(reject([], auto('A', 1_050_000))).toBe('OutOfRange');
    expect(reject([manual('A', 300_000)], manual('B', 300_000))).toBe(
      'BelowMinimum',
    );
    expect(
      reject([auto('A', 400_000), manual('B', 250_000)], auto('B', 250_000)),
    ).toBe('NotIncreasing');
    expect(reject([auto('A', 400_000)], auto('A', 300_000))).toBe(
      'NotIncreasing',
    );
  });

  it('AC-AU06: raising the leading ceiling does not raise the price', () => {
    const { trace, bidders } = run([
      auto('A', 400_000),
      manual('B', 250_000),
      auto('A', 800_000),
    ]);
    expect(trace.at(-1)).toEqual([300_000, 'A']);
    expect(bidders.get('A')!.level).toBe(800_000);
  });

  it('the leader cannot outbid themselves with a manual bid', () => {
    expect(reject([manual('A', 300_000)], manual('A', 350_000))).toBe(
      'LeaderMustRaiseAuto',
    );
  });

  it('FR-AU05: disabling a leading Auto keeps the obligation at the price', () => {
    const { a, bidders, trace } = run([
      auto('A', 400_000),
      manual('B', 250_000),
      off('A'),
    ]);
    expect(trace.at(-1)).toEqual([300_000, 'A']);
    expect(bidders.get('A')).toMatchObject({ mode: 'Manual', level: 300_000 });
    // B can now win with the next step instead of fighting the old ceiling.
    const r = apply(a, [...bidders.values()], manual('B', 350_000));
    expect([r.currentPrice, r.leaderId]).toEqual([350_000, 'B']);
  });

  it('FR-AU05: disabling a tied leading Auto keeps its earlier priority', () => {
    const { a, bidders } = run([
      auto('A', 400_000),
      auto('B', 400_000),
      off('A'),
    ]);
    expect([a.currentPrice, a.leaderId]).toEqual([400_000, 'A']);
    expect(bidders.get('A')!.levelSequence).toBeLessThan(
      bidders.get('B')!.levelSequence,
    );
  });

  it('disabling an outbid Auto changes nothing but the mode', () => {
    const { trace, bidders } = run([
      auto('A', 300_000),
      manual('B', 500_000),
      off('A'),
    ]);
    expect(trace.at(-1)).toEqual([500_000, 'B']);
    expect(bidders.get('A')).toMatchObject({ mode: 'Manual', level: 300_000 });
    expect(reject([manual('A', 300_000)], off('A'))).toBe('NoAutoBid');
  });

  it('two competing Autos produce one deterministic result, not a bid loop', () => {
    const { a } = run(
      [auto('A', 1_000_000), auto('B', 950_000)],
      10_000,
      10_000,
    );
    expect([a.currentPrice, a.leaderId, a.nextSequence]).toEqual([
      960_000,
      'A',
      3,
    ]);
    expect(minimumBid(a)).toBe(970_000);
  });

  it('prices stay on the grid and the leader always holds the top level', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let round = 0; round < 200; round++) {
      let a: EngineAuction = {
        startPrice: 120_000,
        step: 10_000,
        currentPrice: null,
        leaderId: null,
        nextSequence: 1,
      };
      const bidders = new Map<string, EngineBidder>();
      for (let i = 0; i < 12; i++) {
        const id = 'ABCD'[Math.floor(rnd() * 4)];
        const amount = minimumBid(a) + Math.floor(rnd() * 5) * 10_000;
        const action =
          rnd() < 0.5 ? manual(id, amount) : auto(id, amount + 30_000);
        try {
          const r = apply(a, [...bidders.values()], action);
          bidders.set(r.bidder.bidderId, r.bidder);
          a = { ...a, ...r };
        } catch {
          continue;
        }
        const top = Math.max(...[...bidders.values()].map((b) => b.level));
        expect((a.currentPrice! - 120_000) % 10_000).toBe(0);
        expect(a.currentPrice!).toBeLessThanOrEqual(top);
        expect(bidders.get(a.leaderId!)!.level).toBe(top);
      }
    }
  });
});
