// Shopee get_order_detail returns zero for bundle deals, not an authoritative unit price.
// get_escrow_detail.items.discounted_price is a line subtotal, including all purchased units.
const present = value => value != null && String(value).trim() !== '';
const positive = value => present(value) && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function orderItemPrice(item) {
  const promotions = [item.promotion_type, ...(Array.isArray(item.promotion_list) ? item.promotion_list : []).map(p => p.promotion_type)];
  if (promotions.includes('bundle_deal')) return null;
  if (present(item.model_discounted_price)) return positive(item.model_discounted_price);
  return positive(item.model_original_price ?? item.original_price ?? item.item_price);
}
export function escrowItemPrice(item, financialItems) {
  if (!Array.isArray(financialItems)) return null;
  const matches = financialItems.filter(line => String(line.item_id) === String(item.item_id) && String(line.model_id ?? 0) === String(item.model_id ?? 0));
  if (matches.length !== 1) return null; // Repeated variants require an unambiguous line identity.
  const line = matches[0];
  const quantity = Number(line.quantity_purchased);
  const subtotal = positive(line.discounted_price);
  if (!subtotal || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity !== Number(item.quantity)) return null;
  const cents = Math.round(subtotal * 100);
  if (!Number.isSafeInteger(cents) || cents % quantity !== 0) return null;
  return cents / quantity / 100;
}
