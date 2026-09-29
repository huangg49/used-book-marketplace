import type { ClientSession, Db } from 'mongodb';

// Reference rows inserted by PostgreSQL migrations 20260927000000 (service
// areas), 20260927020000 (quote policy) and 20260928010000 (finite simulator
// capital with its opening journal). Inserted only when absent; never updated.

export const CAPITAL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
export const CLEARING_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
export const OPENING_JOURNAL_ID = '00000000-0000-4000-8000-000000000003';
export const OPENING_CAPITAL = 100_000_000;
export const LEDGER_SEQUENCE_COUNTER = 'ledger_journal_sequence';

export const referenceData = {
  service_areas: [{ _id: 'HCM-DEMO-v1', name: 'TP.HCM', demoOnly: true }],
  service_localities: [
    {
      _id: 'HCM-DEMO-v1:DEMO-A',
      areaCode: 'HCM-DEMO-v1',
      code: 'DEMO-A',
      label: 'Khu vực demo A — TP.HCM',
    },
    {
      _id: 'HCM-DEMO-v1:DEMO-B',
      areaCode: 'HCM-DEMO-v1',
      code: 'DEMO-B',
      label: 'Khu vực demo B — TP.HCM',
    },
  ],
  sale_quote_policies: [
    {
      _id: 'HCM-DIRECT-v1',
      shippingFee: 30_000,
      commissionBps: 500,
      ttlSeconds: 300,
    },
  ],
  sale_quote_policy_selection: [
    { _id: 'DirectSale', policyCode: 'HCM-DIRECT-v1' },
  ],
  wallet_accounts: [
    {
      _id: CAPITAL_ACCOUNT_ID,
      ownerId: null,
      orderId: null,
      purpose: 'SimulatorCapital',
      currency: 'VND',
    },
    {
      _id: CLEARING_ACCOUNT_ID,
      ownerId: null,
      orderId: null,
      purpose: 'SimulatorClearing',
      currency: 'VND',
    },
  ],
  account_locks: [
    { _id: CAPITAL_ACCOUNT_ID, lockSeq: 0 },
    { _id: CLEARING_ACCOUNT_ID, lockSeq: 0 },
  ],
  openingEntries: [
    { accountId: CAPITAL_ACCOUNT_ID, debit: 0, credit: OPENING_CAPITAL },
    { accountId: CLEARING_ACCOUNT_ID, debit: OPENING_CAPITAL, credit: 0 },
  ],
};

export async function insertReferenceData(db: Db, session: ClientSession) {
  const s = { session };
  for (const name of [
    'service_areas',
    'service_localities',
    'sale_quote_policies',
    'sale_quote_policy_selection',
    'wallet_accounts',
    'account_locks',
  ] as const)
    for (const row of referenceData[name])
      if (!(await db.collection(name).findOne({ _id: row._id } as never, s)))
        await db.collection(name).insertOne(row as never, s);
  // One finite, explicitly simulated opening journal, never an unjournalled balance.
  if (
    !(await db
      .collection('ledger_journals')
      .findOne({ _id: OPENING_JOURNAL_ID } as never, s))
  ) {
    const [{ now }] = await db
      .aggregate<{ now: Date }>(
        [{ $documents: [{}] }, { $project: { _id: 0, now: '$$NOW' } }],
        s,
      )
      .toArray();
    await db.collection('ledger_journals').insertOne(
      {
        _id: OPENING_JOURNAL_ID,
        sequence: 1,
        type: 'OpeningCapital',
        topupId: null,
        eventId: null,
        orderId: null,
        receiptId: null,
        postedAt: now,
      } as never,
      s,
    );
    for (const entry of referenceData.openingEntries)
      await db.collection('ledger_entries').insertOne(
        {
          _id: `${OPENING_JOURNAL_ID}:${entry.accountId}`,
          journalId: OPENING_JOURNAL_ID,
          ...entry,
        } as never,
        s,
      );
  }
  if (
    !(await db
      .collection('counters')
      .findOne({ _id: LEDGER_SEQUENCE_COUNTER } as never, s))
  )
    await db
      .collection('counters')
      .insertOne({ _id: LEDGER_SEQUENCE_COUNTER, value: 1 } as never, s);
}
