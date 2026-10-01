(function () {
  'use strict';
  const tiers = Object.freeze([
    Object.freeze({ belowCents: 8000, rate: 20, fixedCents: 450 }),
    Object.freeze({ belowCents: 10000, rate: 14, fixedCents: 1600 }),
    Object.freeze({ belowCents: 20000, rate: 14, fixedCents: 2000 }),
    Object.freeze({ belowCents: Infinity, rate: 14, fixedCents: 2600 })
  ]);
  function calculateLine(item) {
    if (item?.unit_price == null || item?.quantity == null || String(item.unit_price).trim() === '' || String(item.quantity).trim() === '') return null;
    const price = Number(item.unit_price);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    const unitCents = Math.round(price * 100);
    if (!Number.isSafeInteger(unitCents)) return null;
    const tier = tiers.find(value => unitCents < value.belowCents);
    const feeUnitCents = Math.round(unitCents * tier.rate / 100) + tier.fixedCents;
    const grossCents = unitCents * quantity;
    const commissionCents = feeUnitCents * quantity;
    const receiptCents = grossCents - commissionCents;
    if (![grossCents, commissionCents, receiptCents].every(Number.isSafeInteger)) return null;
    return { unitCents, quantity, rate: tier.rate, fixedCents: tier.fixedCents, feeUnitCents, grossCents, commissionCents, receiptCents };
  }
  function estimate(order, items, complete = true) {
    if (order?.status === 'CANCELLED') return { kind: 'cancelled', reason: 'Pedido cancelado', receiptCents: null };
    if (!Array.isArray(items) || !items.length) return { kind: 'unavailable', reason: 'Itens não disponíveis', receiptCents: null };
    if (!complete) return { kind: 'unavailable', reason: 'Itens incompletos', receiptCents: null };
    if (items.some(item => item.shop_id != null && String(item.shop_id) !== String(order.shop_id))) return { kind: 'unavailable', reason: 'Itens de outra loja', receiptCents: null };
    const lines = items.map(calculateLine);
    if (lines.some(line => !line)) return { kind: 'unavailable', reason: 'Preço ou quantidade não informado', receiptCents: null };
    const totals = { kind: 'estimated', grossCents: 0, commissionCents: 0, receiptCents: 0 };
    for (const line of lines) for (const key of ['grossCents', 'commissionCents', 'receiptCents']) totals[key] += line[key];
    if (![totals.grossCents, totals.commissionCents, totals.receiptCents].every(Number.isSafeInteger)) return { kind: 'unavailable', reason: 'Valor fora do limite de cálculo', receiptCents: null };
    return totals;
  }
  window.mavisOrderCommission = Object.freeze({ calculateLine, estimate });
})();
