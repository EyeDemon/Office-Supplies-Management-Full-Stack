'use strict';

const db = require('../../shared/config/db');

describe('db.beginTransactionWithTimeout Memory Leak Test', () => {
  let mockConn;

  beforeEach(() => {
    mockConn = {
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue(),
      beginTransaction: jest.fn().mockResolvedValue(),
    };
  });

  test('Should only patch conn.commit once across multiple calls on same connection', async () => {
    const originalCommitMock = mockConn.commit;

    // 1st call
    await db.beginTransactionWithTimeout(mockConn);
    const patchedCommit1 = mockConn.commit;
    expect(mockConn._originalCommit).toBeDefined();

    // 2nd call
    await db.beginTransactionWithTimeout(mockConn);
    const patchedCommit2 = mockConn.commit;

    // They should be the same function reference, not another wrapper
    expect(patchedCommit2).toBe(patchedCommit1);

    // Verify it still works
    await mockConn.commit();
    expect(originalCommitMock).toHaveBeenCalledTimes(1);
  });

  test('Should process deferred events after commit', async () => {
    const event = jest.fn().mockResolvedValue();
    await db.beginTransactionWithTimeout(mockConn);
    mockConn._deferredEvents.push(event);

    await mockConn.commit();
    expect(event).toHaveBeenCalledTimes(1);
    expect(mockConn._deferredEvents).toHaveLength(0);
  });

  test('Should discard deferred events after rollback', async () => {
    mockConn.rollback = jest.fn().mockResolvedValue();
    const event = jest.fn().mockResolvedValue();

    await db.beginTransactionWithTimeout(mockConn);
    mockConn._deferredEvents.push(event);

    await mockConn.rollback();
    expect(event).not.toHaveBeenCalled();
    expect(mockConn._deferredEvents).toHaveLength(0);
  });

  test('Standard beginTransaction should also initialize deferredEvents', async () => {
    // We simulate getting a connection from the pool (which would be patched)
    // Here we manually patch it for the test
    // Note: in real use, getConnection() returns a patched connection
    await db.beginTransactionWithTimeout(mockConn); // this triggers patching

    await mockConn.beginTransaction();
    expect(mockConn._deferredEvents).toBeDefined();
    expect(mockConn._deferredEvents).toHaveLength(0);
  });
});
