export const ORDER_PAGE_LIMIT = 3;
export const MAX_SYNC_ATTEMPTS = 5;
export const DAILY_SYNC_LIMIT = 160;
export const STORAGE_STOP_BYTES = 450_000_000;
const WINDOW_SECONDS = 14 * 86400;
const OVERLAP_SECONDS = 300;

export function orderWindow(nowSeconds, watermark, pending, initialFrom) {
  const until = Math.floor(nowSeconds) - 60;
  if (pending && Number.isFinite(pending.from) && Number.isFinite(pending.to)
      && pending.from < pending.to && pending.to <= until && pending.to - pending.from <= WINDOW_SECONDS
      && typeof pending.cursor === 'string') return pending;
  const previous = Number(watermark);
  const initial = Number(initialFrom);
  const since = previous > 0 && Number.isFinite(previous) ? previous
    : initial > 0 && Number.isFinite(initial) ? initial : until - WINDOW_SECONDS + OVERLAP_SECONDS;
  const from = Math.max(0, Math.min(since - OVERLAP_SECONDS, until - OVERLAP_SECONDS));
  return { from, to: Math.min(until, from + WINDOW_SECONDS), cursor: '' };
}

export function sameOrderVersion(incoming, stored) {
  if (!stored || !incoming.updated_at || !stored.updated_at) return false;
  for (const field of ['created_at', 'updated_at']) {
    if (new Date(incoming[field]).getTime() !== new Date(stored[field]).getTime()) return false;
  }
  if (Number(incoming.total_amount) !== Number(stored.total_amount)) return false;
  return ['status', 'buyer_username', 'payment_method', 'items_summary', 'shipping_address']
    .every(field => String(incoming[field] ?? '') === String(stored[field] ?? ''));
}

export function syncFailure(code, attempts) {
  const permanent = ['partner_key_expired', 'reauthorization_required'].includes(code);
  return { pause: permanent || attempts >= MAX_SYNC_ATTEMPTS, retryMinutes: Math.min(15 * 2 ** Math.min(Math.max(attempts - 1, 0), 5), 360) };
}

export function shopeeFailure(apiCode, httpStatus = 502) {
  if (apiCode === 'error_partner_key_expired') return {
    status: 409, code: 'partner_key_expired', message: 'A chave do aplicativo Shopee expirou. Renove a Live API Partner Key no console da Shopee e atualize a configuração segura do Supabase antes de retomar.'
  };
  if (['error_refresh_token', 'invalid_refresh_token', 'error_refresh_token_expired', 'refresh_token_expired', 'refresh_token_not_exist', 'error_auth'].includes(apiCode)) return {
    status: 409, code: 'reauthorization_required', message: 'A autorização Shopee precisa ser renovada. Reautorize esta loja em Integrações.'
  };
  return { status: 502, code: 'shopee_unavailable', message: `Não foi possível consultar a Shopee (${String(apiCode || httpStatus).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)}). Tente novamente mais tarde.` };
}
