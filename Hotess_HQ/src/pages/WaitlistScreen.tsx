import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WaitlistCard } from '../components/WaitlistCard';
import { fetchWaitlists, createWaitlist, updateWaitlist } from '../api/waitlists';
import { createBooking } from '../api/bookings';
import { todayStr } from '../api/mockData';
import { BookingStatus, WaitlistStatus, type ReservationWaitlist } from '../types';

interface FormValues {
  name: string;
  phone: string;
  numOfGuest: number;
  zoneId: string;
  notes: string;
  isVip: boolean;
}

type TabKey = 'all' | 'waiting' | 'confirmed' | 'seated';

export function WaitlistScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { linkInfo } = useStore();
  const { user } = useAuth();
  const zones = linkInfo?.zones ?? [];
  const [entries, setEntries] = useState<ReservationWaitlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [cancelTarget, setCancelTarget] = useState<ReservationWaitlist | null>(null);
  const [quickSeatTarget, setQuickSeatTarget] = useState<ReservationWaitlist | null>(null);
  const [quickSeatZoneId, setQuickSeatZoneId] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { numOfGuest: 2, isVip: false },
  });

  const load = async () => {
    if (!linkInfo) return;
    setLoading(true);
    try {
      const w = await fetchWaitlists(linkInfo);
      setEntries(w);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkInfo]);

  const onCreate = async (values: FormValues) => {
    if (!linkInfo) return;
    try {
      await createWaitlist({
        name: values.name,
        phone: values.phone,
        numOfGuest: Number(values.numOfGuest),
        zoneId: values.zoneId ? Number(values.zoneId) : undefined,
        notes: values.notes,
        isVip: values.isVip,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
      });
      toast.success(t('waitlist.success'));
      reset({ numOfGuest: 2, isVip: false, name: '', phone: '', zoneId: '', notes: '' });
      load();
    } catch {
      toast.error(t('waitlist.error'));
    }
  };

  const onCall = async (entry: ReservationWaitlist) => {
    try {
      await updateWaitlist(entry.waitlistId, { status: WaitlistStatus.Confirmed });
      toast.success(t('waitlist.success'));
      load();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const doQuickSeat = async () => {
    if (!quickSeatTarget || !linkInfo) return;
    try {
      const booking = await createBooking({
        bookingName: quickSeatTarget.name,
        bookingPhone: quickSeatTarget.phone,
        reservationDate: todayStr(),
        numOfGuest: quickSeatTarget.numOfGuest,
        zoneId: quickSeatZoneId ? Number(quickSeatZoneId) : quickSeatTarget.zoneId,
        status: BookingStatus.Seated,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        channelId: linkInfo.channelId,
        userCreated: user?.userId,
      });
      await updateWaitlist(quickSeatTarget.waitlistId, {
        status: WaitlistStatus.Reserved,
        reservationNo: booking.reservationNo,
      });
      toast.success(t('seating.seatSuccess'));
      setQuickSeatTarget(null);
      setQuickSeatZoneId('');
      load();
      navigate('../seating', { state: { booking } });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    try {
      await updateWaitlist(cancelTarget.waitlistId, { status: WaitlistStatus.Cancelled });
      toast.success(t('common.save'));
      load();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setCancelTarget(null);
    }
  };

  const filtered = useMemo(() => {
    switch (tab) {
      case 'waiting':
        return entries.filter((e) => e.status === WaitlistStatus.Waiting);
      case 'confirmed':
        return entries.filter((e) => e.status === WaitlistStatus.Confirmed);
      case 'seated':
        return entries.filter((e) => e.status === WaitlistStatus.Reserved);
      default:
        return entries;
    }
  }, [entries, tab]);

  const stats = useMemo(() => {
    const waiting = entries.filter((e) => e.status === WaitlistStatus.Waiting);
    const waitedMinutesList = waiting.map((e) => Math.round((Date.now() - new Date(e.createdDate).getTime()) / 60000));
    const avg = waitedMinutesList.length
      ? Math.round(waitedMinutesList.reduce((a, b) => a + b, 0) / waitedMinutesList.length)
      : 0;
    const longest = waitedMinutesList.length ? Math.max(...waitedMinutesList) : 0;
    return { count: waiting.length, avg, longest };
  }, [entries]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('waitlist.tabAll') },
    { key: 'waiting', label: t('waitlist.tabWaiting') },
    { key: 'confirmed', label: t('waitlist.tabConfirmed') },
    { key: 'seated', label: t('waitlist.tabSeated') },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="mb-1 flex items-center gap-3">
        <button
          onClick={() => navigate('../checkin')}
          aria-label={t('common.back')}
          className="touch-btn btn-secondary flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-white">{t('waitlist.title')}</h1>
      </div>
      <div className="glass-card p-6">
        <h2 className="mb-4 text-lg font-bold text-white">{t('waitlist.create')}</h2>
        <form onSubmit={handleSubmit(onCreate)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">{t('waitlist.name')}</label>
            <input
              className="field touch-btn px-4"
              {...register('name', { required: true })}
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>
          <div>
            <label className="field-label">{t('waitlist.phone')}</label>
            <input
              className="field touch-btn px-4"
              {...register('phone', { required: true })}
            />
            {errors.phone && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>
          <div>
            <label className="field-label">{t('waitlist.partySize')}</label>
            <input
              type="number"
              min={1}
              className="field touch-btn px-4"
              {...register('numOfGuest', { required: true, min: 1, valueAsNumber: true })}
            />
          </div>
          <div>
            <label className="field-label">{t('waitlist.zone')}</label>
            <select
              className="field touch-btn px-3"
              {...register('zoneId')}
            >
              <option value="">{t('booking.selectZone')}</option>
              {zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>
                  {z.zoneName}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">{t('waitlist.notes')}</label>
            <textarea
              rows={2}
              className="field px-4 py-2"
              {...register('notes')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" className="h-5 w-5 accent-[#ef4444]" {...register('isVip')} />
            {t('waitlist.vip')}
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="touch-btn btn-primary w-full rounded-xl font-semibold"
            >
              {t('waitlist.submit')}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card p-4">
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="stat-tile">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t('waitlist.waitingCount')}</p>
            <p className="text-lg font-bold text-white">{stats.count}</p>
          </div>
          <div className="stat-tile">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t('waitlist.avgWait')}</p>
            <p className="text-lg font-bold text-white">
              {stats.avg} {t('waitlist.minutes')}
            </p>
          </div>
          <div className="stat-tile">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t('waitlist.longestWait')}</p>
            <p className="text-lg font-bold text-white">
              {stats.longest} {t('waitlist.minutes')}
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`touch-btn whitespace-nowrap rounded-full px-4 text-sm font-medium ${
                tab === tb.key
                  ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_16px_rgba(239,68,68,0.35)]'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner label={t('common.loading')} />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('waitlist.empty')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <WaitlistCard
                key={entry.waitlistId}
                entry={entry}
                onCall={onCall}
                onQuickSeat={(e) => setQuickSeatTarget(e)}
                onCancel={(e) => setCancelTarget(e)}
              />
            ))}
          </div>
        )}
      </div>

      {quickSeatTarget && (
        <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4" onClick={() => setQuickSeatTarget(null)}>
          <div className="glass-card modal-panel w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-white">{t('waitlist.quickSeat')}</h3>
            <p className="mb-3 text-sm text-slate-300">
              {quickSeatTarget.name} · {quickSeatTarget.numOfGuest}p
            </p>
            <label className="field-label">{t('waitlist.zone')}</label>
            <select
              value={quickSeatZoneId}
              onChange={(e) => setQuickSeatZoneId(e.target.value)}
              className="field touch-btn mb-4 px-3"
            >
              <option value="">{t('booking.selectZone')}</option>
              {zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>
                  {z.zoneName}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setQuickSeatTarget(null)}
                className="touch-btn btn-secondary flex-1 rounded-xl font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={doQuickSeat}
                className="touch-btn btn-success flex-1 rounded-xl font-semibold"
              >
                {t('waitlist.quickSeat')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title={t('waitlist.confirmCancel')}
        message={t('waitlist.confirmCancelMsg')}
        danger
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
