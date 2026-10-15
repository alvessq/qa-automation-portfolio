import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPreparer, shouldPrepare } from '../src/prepare.mjs';

const mobileOn = [{ workspace: 'mobile-e2e', enabled: true }];
const mobileOff = [{ workspace: 'mobile-e2e', enabled: false }, { workspace: 'web-e2e', enabled: true }];

describe('shouldPrepare', () => {
  it('prepara só quando há job mobile ativo', () => {
    assert.equal(shouldPrepare({}, mobileOn), true);
    assert.equal(shouldPrepare({}, mobileOff), false);
  });

  it('PREPARE_MOBILE força os dois lados e a CI nunca prepara', () => {
    assert.equal(shouldPrepare({ PREPARE_MOBILE: 'true' }, mobileOff), true);
    assert.equal(shouldPrepare({ PREPARE_MOBILE: 'false' }, mobileOn), false);
    assert.equal(shouldPrepare({ CI: 'true' }, mobileOn), false);
  });
});

describe('createPreparer', () => {
  function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  }

  it('acompanha o script do início ao fim e não roda dois ao mesmo tempo', () => {
    const child = fakeChild();
    const calls = [];
    const preparer = createPreparer({ spawnScript: (...args) => (calls.push(args), child) });

    assert.equal(preparer.start(), true);
    assert.equal(preparer.start(), false);
    assert.deepEqual(calls, [['mobile-e2e', 'prepare:device']]);
    assert.equal(preparer.state().status, 'running');

    child.stdout.emit('data', Buffer.from('[preparo] device já online: emulator-5554\n'));
    child.emit('close', 0);
    assert.equal(preparer.state().status, 'ready');
    assert.match(preparer.state().output, /device já online/);
  });

  it('marca falha quando o script sai com erro', () => {
    const child = fakeChild();
    const preparer = createPreparer({ spawnScript: () => child });
    preparer.start();
    child.emit('close', 1);
    assert.equal(preparer.state().status, 'failed');
  });
});
