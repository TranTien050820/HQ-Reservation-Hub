import { BookingStatus, type ReservationBooking, type TableCharge } from '../types';
import { formatVndShort } from './money';

/**
 * The money side of a booking added in 10/2026 — table charges (YC1), the surcharge waiver
 * (YC3) and free seats (YC5) — in one place, so the seating screen, the walk-in form and the
 * booking card read and write them the same way.
 *
 * Every number here is display or intent only: the server computes what a booking owes from
 * its tables and ignores any amount a client sends.
 */

/** Minimal shape of i18next's `t`, so these stay plain functions. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** `SurchargeWaiveReason` is varchar(255) — longer is refused with SURCHARGE_WAIVE_REASON_TOO_LONG. */
export const WAIVE_REASON_MAX_LENGTH = 255;

/** A money field that may be null, missing or not a number at all — every one of which means 0. */
export function amountOf(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** tablenum → today's charges, for the tables that have any (the config already leaves the rest out). */
export function tableChargeMap(charges: readonly TableCharge[] | null | undefined): Map<number, TableCharge> {
  const map = new Map<number, TableCharge>();
  for (const charge of charges ?? []) {
    const tableNum = Number(charge?.tableNum);
    if (!Number.isFinite(tableNum)) continue;
    if (amountOf(charge.minimumCharge) <= 0 && amountOf(charge.surcharge) <= 0) continue;
    map.set(tableNum, charge);
  }
  return map;
}

export interface ChargeTotals {
  minimumCharge: number;
  surcharge: number;
}

/**
 * What a set of tables comes to at today's prices. Merged tables add up — the same sum the
 * server snapshots onto the booking when it is seated at them.
 */
export function chargesOfTables(tablenums: Iterable<number>, charges: ReadonlyMap<number, TableCharge>): ChargeTotals {
  let minimumCharge = 0;
  let surcharge = 0;
  for (const tablenum of tablenums) {
    const charge = charges.get(tablenum);
    if (!charge) continue;
    minimumCharge += amountOf(charge.minimumCharge);
    surcharge += amountOf(charge.surcharge);
  }
  return { minimumCharge, surcharge };
}

/** "Tối thiểu 5tr · Phụ thu 500k" — the small line on a table card. Null when the table costs nothing extra. */
export function shortChargeLabel(charge: TableCharge | undefined, t: Translate, language: string): string | null {
  if (!charge) return null;
  const parts: string[] = [];
  const minimum = amountOf(charge.minimumCharge);
  const surcharge = amountOf(charge.surcharge);
  if (minimum > 0) parts.push(t('charges.minimum', { amount: formatVndShort(minimum, language) }));
  if (surcharge > 0) parts.push(t('charges.surcharge', { amount: formatVndShort(surcharge, language) }));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * How many of the party are not charged. Null, missing or nonsense read as 0 — the column is
 * optional, and an API without it simply never sends the field.
 */
export function freeSeatCount(booking: Pick<ReservationBooking, 'freeSeats'>): number {
  const n = Number(booking.freeSeats ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * "6 khách · 2 miễn phí" when part of the party is not charged, the usual "6p" otherwise.
 * Not to be confused with the check-in strip's `freeSeatsNow`, which counts EMPTY seats.
 */
export function partyText(booking: Pick<ReservationBooking, 'partySize' | 'freeSeats'>, t: Translate): string {
  const free = freeSeatCount(booking);
  return free > 0 ? t('booking.partyWithFree', { party: booking.partySize, free }) : `${booking.partySize}p`;
}

export function isSurchargeWaived(booking: Pick<ReservationBooking, 'isSurchargeWaived'> | null | undefined): boolean {
  return Number(booking?.isSurchargeWaived) === 1;
}

/** The statuses in which the server still lets the waiver change — SURCHARGE_WAIVE_LOCKED anywhere else. */
const WAIVER_OPEN_STATUSES: ReadonlySet<number> = new Set<number>([
  BookingStatus.New,
  BookingStatus.Confirm,
  BookingStatus.Reserved,
  BookingStatus.Seated,
]);

/** Stored status, not the effective one: an Overdue booking is still a Confirm/Reserved one to the server. */
export function canChangeWaiverAt(status: number | null | undefined): boolean {
  return status != null && WAIVER_OPEN_STATUSES.has(Number(status));
}

/** Why a waiver about to be sent would be refused, before it is sent. */
export function waiveReasonProblem(
  storedWaived: boolean,
  wantWaived: boolean,
  reason: string,
): 'required' | 'tooLong' | null {
  if (!wantWaived || storedWaived) return null;
  const trimmed = reason.trim();
  if (!trimmed) return 'required';
  return trimmed.length > WAIVE_REASON_MAX_LENGTH ? 'tooLong' : null;
}

/**
 * The waiver fields of a booking write — present ONLY when the hostess changed the flag. The
 * server checks the permission on a change and nowhere else, and a PUT without them leaves the
 * waiver as it is, so a write that did not touch it must not carry it. Turning it off clears
 * the reason, the who and the when on the server.
 */
export function waiverPatch(
  storedWaived: boolean,
  wantWaived: boolean,
  reason: string,
): { isSurchargeWaived?: number; surchargeWaiveReason?: string } {
  if (storedWaived === wantWaived) return {};
  return wantWaived ? { isSurchargeWaived: 1, surchargeWaiveReason: reason.trim() } : { isSurchargeWaived: 0 };
}

/** "Đã miễn phụ thu · bởi Lan · lý do Khách VIP" — the parts the booking actually carries. */
export function waiverSummary(
  booking: Pick<ReservationBooking, 'surchargeWaivedByName' | 'surchargeWaivedBy' | 'surchargeWaiveReason'>,
  t: Translate,
): string {
  const name = booking.surchargeWaivedByName?.trim() || (booking.surchargeWaivedBy ? `#${booking.surchargeWaivedBy}` : '');
  const reason = booking.surchargeWaiveReason?.trim();
  return [
    t('surcharge.waived'),
    name ? t('surcharge.waivedBy', { name }) : null,
    reason ? t('surcharge.waivedReason', { reason }) : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}
