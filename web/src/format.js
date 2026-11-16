const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
export const formatMoney = (cents) => money.format((cents ?? 0) / 100);

export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const formatDateTime = (iso) => `${formatDate(iso)}, ${formatTime(iso)}`;

export const formatDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

/** Local-midnight Date for today + offset days. */
export function dayStart(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/** ISO bounds for the local calendar day containing `d`. */
export function dayRange(d) {
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Value for <input type="datetime-local"> -> ISO string with offset (via Date). */
export const localInputToIso = (v) => new Date(v).toISOString();
