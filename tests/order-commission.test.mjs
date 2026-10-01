import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../order-commission.js', import.meta.url), 'utf8'), context);
const { calculateLine, estimate } = context.window.mavisOrderCommission;

test('the user supplied commission tiers include each price boundary and round to cents', () => {
  for (const [price, fee, receipt] of [[79.99,2050,5949],[80,2720,5280],[99.99,3000,6999],[100,3400,6600],[199.99,4800,15199],[200,5400,14600],[499.99,9600,40399],[500,9600,40400],[500.01,9600,40401]]) {
    const line = calculateLine({ unit_price: price, quantity: 1 });
    assert.equal(line.commissionCents, fee, `commission for ${price}`);
    assert.equal(line.receiptCents, receipt, `receipt for ${price}`);
  }
});

test('fixed charges apply to every unit and mixed tiers use unit prices instead of the order total', () => {
  const two = calculateLine({ unit_price: '79.99', quantity: '2' });
  assert.equal(two.rate, 20); assert.equal(two.commissionCents, 4100); assert.equal(two.receiptCents, 11898);
  const result = estimate({ shop_id: 1, total_amount: 999, status: 'SHIPPED' }, [{ shop_id: 1, unit_price: 80, quantity: 2 }, { shop_id: 1, unit_price: 39.99, quantity: 1 }]);
  assert.equal(result.grossCents, 19999); assert.equal(result.commissionCents, 6690); assert.equal(result.receiptCents, 13309);
  assert.equal(result.grossCents - result.commissionCents, result.receiptCents);
});

test('Pix is ignored and a low priced item is not silently clamped to a different commission', () => {
  const items = [{ unit_price: 120, quantity: 1 }];
  assert.equal(estimate({ payment_method: 'Pix' }, items).receiptCents, 8320);
  assert.equal(estimate({ payment_method: 'Credit Card' }, items).receiptCents, 8320);
  assert.equal(calculateLine({ unit_price: 3, quantity: 1 }).receiptCents, -210);
});

test('missing, invalid, incomplete and cross-shop details have no invented fallback to the buyer total', () => {
  const order = { shop_id: 1, total_amount: 100 };
  for (const items of [[], null, [{ unit_price: null, quantity: 1 }], [{ unit_price: '', quantity: 1 }], [{ unit_price: 50, quantity: 0 }], [{ unit_price: 50, quantity: 1.5 }], [{ unit_price: -1, quantity: 1 }], [{ unit_price: 'invalid', quantity: 1 }], [{ unit_price: 50, quantity: null }], [{ shop_id: 2, unit_price: 50, quantity: 1 }]]) {
    assert.equal(estimate(order, items).kind, 'unavailable');
    assert.equal(estimate(order, items).receiptCents, null);
  }
  assert.equal(estimate(order, [{ unit_price: 50, quantity: 1 }], false).kind, 'unavailable');
  assert.equal(estimate({ ...order, status: 'CANCELLED' }, [{ unit_price: 50, quantity: 1 }]).kind, 'cancelled');
});
