import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SearchBar, { type SearchValues } from '../components/SearchBar';
import DateStrip from '../components/DateStrip';
import { useStoreData } from '../store/StoreDataContext';
import { useMenu, useSlotPoolAvailability } from '../api/queries';
import { bookableByPeriod, buildPeriodAvailability, periodsForDate, type TimeSlot } from '../lib/slots';
import { restaurantCuisine, restaurantPhoto } from '../lib/restaurantImages';
import { menuItemPhoto } from '../lib/menuImages';
import { formatDateHeading, resolveLocale } from '../lib/i18nFormat';

export default function RestaurantPage() {
  const { publicKey, data } = useStoreData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const partySize = Number(searchParams.get('partySize') ?? '2');

  const settings = data?.settings;
  const linkInfo = data?.linkInfo;
  const zones = useMemo(() => data?.zones ?? [], [data]);
  const periods = useMemo(() => data?.periods ?? [], [data]);
  const rules = useMemo(() => data?.periodRules ?? [], [data]);
  const overrides = useMemo(() => data?.dateOverrides ?? [], [data]);
  const goodToKnows = data?.goodToKnows ?? [];
  const storeHighlights = data?.highlightEvents ?? [];

  const { items: menuItems } = useMenu(settings?.siteId ?? 0, settings?.sNum ?? 0);
  const menuNameKey = i18n.language === 'vi' ? 'nameVi' : 'nameEn';
  const signatureItems = menuItems.filter((item) => item.isSignature).slice(0, 3);

  const storeName = settings?.storeName || t('restaurant.untitled', { defaultValue: 'Restaurant' });
  const photoKey = settings?.sNum ?? 0;
  const heroImage = data?.mainCarousels?.[0]?.imageUrl || restaurantPhoto(photoKey);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  // Pick a sensible default seating area once zones for this store arrive.
  useEffect(() => {
    setSelectedZoneId(zones.find((zone) => !zone.isPauseBooking)?.zoneID ?? zones[0]?.zoneID ?? null);
  }, [zones]);

  const availablePeriods = useMemo(
    () => periodsForDate(periods, rules, date, overrides),
    [periods, rules, date, overrides],
  );
  const periodAvailability = useMemo(
    () => buildPeriodAvailability(availablePeriods, date),
    [availablePeriods, date],
  );

  const selectedZone = zones.find((z) => z.zoneID === selectedZoneId) ?? null;
  const zoneIsBookable = !selectedZone || !selectedZone.isPauseBooking;

  // Live seats for the chosen seating area on this date, through this link's channel — the one
  // capacity figure that holds for every allocation tree. Asked without a time, so each pool row
  // lists the periods it still has room in. No seating area (a store without zones) means nothing
  // to ask: such a booking takes no capacity.
  const availability = useSlotPoolAvailability(
    linkInfo && selectedZone && zoneIsBookable
      ? {
          siteId: linkInfo.siteId,
          sNum: linkInfo.sNum,
          statNum: linkInfo.statNum,
          date,
          zoneId: selectedZone.zoneID,
          channelId: linkInfo.channelId,
          channelPartnerId: linkInfo.channelPartnerID ?? undefined,
        }
      : null,
  );
  const periodBookable = useMemo(
    () => (availability.data ? bookableByPeriod(availability.data) : null),
    [availability.data],
  );
  // A period that can't seat this party. Not known (still loading, or the check failed) counts as
  // open: the booking page asks again for the exact time before anything is sent.
  const isPeriodFull = useCallback(
    (periodID: number) => periodBookable != null && (periodBookable.get(periodID) ?? 0) < partySize,
    [periodBookable, partySize],
  );

  // Default the period dropdown to the first one that actually has bookable times and room for
  // this party, and re-pick whenever the date, area or party size means the previous choice no
  // longer applies.
  useEffect(() => {
    setSelectedPeriodId((current) => {
      const open = periodAvailability.filter((entry) => !isPeriodFull(entry.period.periodID));
      if (current && open.some((entry) => entry.period.periodID === current)) return current;
      return (open[0] ?? periodAvailability[0])?.period.periodID ?? null;
    });
  }, [periodAvailability, isPeriodFull]);

  const selectedPeriodAvailability =
    periodAvailability.find((entry) => entry.period.periodID === selectedPeriodId) ?? periodAvailability[0] ?? null;
  const allPeriodsFull =
    periodAvailability.length > 0 && periodAvailability.every((entry) => isPeriodFull(entry.period.periodID));

  // Why guests might see no times: either the restaurant simply isn't open/bookable
  // on this date (no period runs, or every remaining slot today has already passed),
  // or the chosen seating area has no room left — none at all, or just not enough for
  // this party. Surface the right reason instead of a generic empty state.
  const unavailableReason = !zoneIsBookable
    ? t('restaurant.noBookableZone')
    : allPeriodsFull
      ? periodAvailability.some((entry) => (periodBookable?.get(entry.period.periodID) ?? 0) > 0)
        ? t('restaurant.noBookablePartySize', { partySize })
        : t('restaurant.noBookableZone')
      : periodAvailability.length === 0
        ? availablePeriods.length === 0
          ? t('restaurant.noBookableNoPeriod')
          : t('restaurant.noBookableNoTime')
        : null;

  const handleSearch = (values: SearchValues) => {
    setSearchParams({ date: values.date, partySize: String(values.partySize) });
  };

  const handleDateChange = (nextDate: string) => {
    setSearchParams({ date: nextDate, partySize: String(partySize) });
  };

  const handlePickSlot = (slot: TimeSlot) => {
    const zone = zones.find((z) => z.zoneID === selectedZoneId);
    const params = new URLSearchParams({
      storeName,
      date,
      time: slot.timeSpan,
      partySize: String(partySize),
      zoneId: String(zone?.zoneID ?? ''),
      zoneName: zone?.zoneName ?? '',
      periodId: String(slot.period?.periodID ?? ''),
      periodName: slot.period?.periodName ?? '',
      label: slot.label,
    });
    navigate(`/${publicKey}/book?${params.toString()}`);
  };

  return (
    <div>
      <div className="relative">
        <div
          className="flex h-72 items-end bg-cover bg-center sm:h-80"
          style={{
            backgroundImage: `linear-gradient(rgba(10,10,15,0.1), rgba(10,10,15,0.7)), url('${heroImage}')`,
          }}
        >
          <div className="mx-auto w-full max-w-6xl px-6 pb-14 text-white sm:pb-20 lg:pb-24">
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{storeName}</h1>
          </div>
        </div>

        <div className="-mt-8 px-6 sm:absolute sm:inset-x-0 sm:bottom-0 sm:mt-0 sm:translate-y-1/2">
          <div className="mx-auto max-w-6xl">
            <SearchBar initial={{ date, partySize }} onSearch={handleSearch} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-16 pt-6 sm:pt-20 lg:pt-24">
        <div className="hidden sm:block">
          <DateStrip value={date} onChange={handleDateChange} />
        </div>
        <h2 className="mt-3 text-xl font-bold">{formatDateHeading(date, i18n.language)}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {partySize} {t(partySize === 1 ? 'common.guest' : 'common.guests')}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside>
            <h3 className="mb-3 text-sm font-semibold uppercase text-neutral-500">{t('restaurant.seatingArea')}</h3>
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
              {zones.map((zone) => (
                <button
                  key={zone.zoneID}
                  disabled={!!zone.isPauseBooking}
                  onClick={() => setSelectedZoneId(zone.zoneID)}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedZoneId === zone.zoneID
                      ? 'border-resy-red bg-resy-red/5 text-resy-red'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                  }`}
                >
                  {zone.zoneName}
                  {!!zone.isPauseBooking && <span className="ml-2 text-xs text-neutral-400">{t('restaurant.paused')}</span>}
                </button>
              ))}
              {zones.length === 0 && (
                <p className="text-sm text-neutral-500">{t('restaurant.noSeatingAreas')}</p>
              )}
            </div>
          </aside>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase text-neutral-500">{t('restaurant.availableTimes')}</h3>
            {periodAvailability.length > 1 && (
              <div className="-mx-6 mb-4 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
                {periodAvailability.map(({ period }) => {
                  // Every time in a period shares its count, so a full period greys out as a whole.
                  const full = isPeriodFull(period.periodID);
                  return (
                    <button
                      key={period.periodID}
                      type="button"
                      disabled={full}
                      onClick={() => setSelectedPeriodId(period.periodID)}
                      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        selectedPeriodId === period.periodID
                          ? 'border-resy-red bg-resy-red text-white'
                          : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      {period.periodName}
                      {full && <span className="ml-1.5 text-xs">{t('restaurant.full')}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {unavailableReason ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-5 py-6 text-center">
                <p className="font-medium text-neutral-700">{t('restaurant.noBookableTitle')}</p>
                <p className="mt-1 text-sm text-neutral-500">{unavailableReason}</p>
              </div>
            ) : selectedPeriodAvailability ? (
              <div>
                <p className="mb-3 text-xs text-neutral-400">
                  {selectedPeriodAvailability.period.startTime.slice(0, 5)} –{' '}
                  {selectedPeriodAvailability.period.endTime.slice(0, 5)}
                </p>
                <div className="grid grid-cols-3 gap-2.5 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
                  {selectedPeriodAvailability.slots.map((slot) => (
                    <button
                      key={slot.minutes}
                      onClick={() => handlePickSlot(slot)}
                      className="flex flex-col items-center gap-1 rounded-xl border border-neutral-200 px-2 py-2.5 text-center transition-colors hover:border-resy-red hover:bg-resy-red/5 sm:px-4 sm:py-3"
                    >
                      <span className="text-sm font-semibold sm:text-base">{slot.label}</span>
                      <span className="text-[11px] text-neutral-500 sm:text-xs">
                        {selectedPeriodAvailability.period.periodName}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="mt-16 flex flex-col gap-8 border-t border-neutral-200 pt-10">
          <section className="rounded-2xl border border-neutral-200 p-6">
            <h2 className="text-lg font-bold">{t('restaurant.about', { name: storeName })}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              {settings?.introduction || t('restaurant.aboutText', { cuisine: restaurantCuisine(photoKey).toLowerCase() })}
            </p>

            {storeHighlights.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {t('restaurant.highlights')}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {storeHighlights.map((item) => (
                    <div key={item.globalId} className="overflow-hidden rounded-xl border border-neutral-200">
                      {item.imageUrl && (
                        <div
                          className="h-28 bg-cover bg-center"
                          style={{ backgroundImage: `url('${item.imageUrl}')` }}
                          role="img"
                          aria-label={item.title}
                        />
                      )}
                      <div className="p-3">
                        {item.tag && (
                          <span className="inline-block rounded-full bg-resy-red/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-resy-red">
                            {item.tag}
                          </span>
                        )}
                        <p className="mt-1.5 text-sm font-semibold">{item.title}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">{item.subTitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="grid gap-8 rounded-2xl border border-neutral-200 p-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {t('restaurant.goodToKnow')}
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-600">
                {(goodToKnows.length > 0
                  ? goodToKnows.map((item) => item.content)
                  : (t('restaurant.goodToKnowItems', { returnObjects: true }) as string[])
                ).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {t('restaurant.menuHighlights')}
              </h3>
              {signatureItems.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {signatureItems.map((item) => (
                    <Link
                      key={item.itemID}
                      to={`/${publicKey}/menu`}
                      className="group overflow-hidden rounded-xl border border-neutral-200 transition-shadow hover:shadow-md"
                    >
                      <img
                        src={item.photoUrl ?? menuItemPhoto(item.itemID)}
                        alt={item[menuNameKey]}
                        className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="p-3">
                        <p className="text-sm font-semibold">{item[menuNameKey]}</p>
                        <p className="text-xs text-neutral-500">
                          {new Intl.NumberFormat(resolveLocale(i18n.language), {
                            style: 'currency',
                            currency: 'USD',
                          }).format(item.price)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">{t('restaurant.noMenuHighlights')}</p>
              )}
              <Link
                to={`/${publicKey}/menu`}
                className="mt-3 inline-block text-sm font-semibold text-resy-red hover:underline"
              >
                {t('restaurant.viewFullMenu')} →
              </Link>
            </div>

            <div className="h-fit rounded-2xl border border-neutral-200 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {t('restaurant.serviceHours')}
              </h3>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {periods.length > 0 ? (
                  periods.map((p) => (
                    <li key={p.periodID} className="flex items-center justify-between">
                      <span className="font-medium">{p.periodName}</span>
                      <span className="text-neutral-500">
                        {p.startTime.slice(0, 5)} – {p.endTime.slice(0, 5)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-neutral-500">{t('restaurant.hoursNotPublished')}</li>
                )}
              </ul>

              {settings?.phoneNumber && (
                <>
                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    {t('restaurant.contact')}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-600">
                    <li>{settings.phoneNumber}</li>
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
