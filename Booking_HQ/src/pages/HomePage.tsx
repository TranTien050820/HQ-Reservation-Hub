import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HeroCarousel, { type HeroSlide } from '../components/HeroCarousel';
import { useStoreData } from '../store/StoreDataContext';
import { useSearchStore } from '../store/searchStore';
import { formatDateHeading } from '../lib/i18nFormat';

interface StepItem {
  title: string;
  desc: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { publicKey, data } = useStoreData();
  const search = useSearchStore();

  const steps = t('home.howItWorks.steps', { returnObjects: true }) as StepItem[];
  const fallbackSlides = t('home.hero.slides', { returnObjects: true }) as HeroSlide[];
  const slides: HeroSlide[] =
    data && data.mainCarousels.length > 0
      ? data.mainCarousels.map((c) => ({
          image: c.imageUrl ?? '',
          title: c.title ?? '',
          subtitle: c.subTitle ?? '',
          tag: c.tag,
        }))
      : fallbackSlides;
  const highlights = data?.highlightEvents ?? [];
  const recommendations = data?.storeRecommendations ?? [];

  const goToRestaurant = () => {
    const params = new URLSearchParams({
      date: search.date,
      partySize: String(search.partySize),
    });
    navigate(`/${publicKey}/restaurant?${params.toString()}`);
  };

  return (
    <div>
      <HeroCarousel slides={slides}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={`/${publicKey}/menu`}
            className="rounded-xl border border-white/70 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t('common.viewMenu')}
          </Link>
        </div>
      </HeroCarousel>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-center text-2xl font-bold">{t('home.highlights.heading')}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-neutral-500">
          {t('home.highlights.subtitle')}
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item) => (
            <button
              key={item.globalId}
              type="button"
              onClick={goToRestaurant}
              className="group overflow-hidden rounded-2xl border border-neutral-200 text-left transition-shadow hover:shadow-md"
            >
              {item.imageUrl && (
                <div
                  className="h-36 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                  style={{ backgroundImage: `url('${item.imageUrl}')` }}
                  role="img"
                  aria-label={item.title}
                />
              )}
              <div className="p-4">
                {item.tag && (
                  <span className="inline-block rounded-full bg-resy-red/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-resy-red">
                    {item.tag}
                  </span>
                )}
                <h3 className="mt-2 font-bold">{item.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">{item.subTitle}</p>
              </div>
            </button>
          ))}
          {highlights.length === 0 && (
            <p className="text-neutral-500">{t('home.highlights.empty', { defaultValue: 'No highlights yet.' })}</p>
          )}
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-neutral-50 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-xl font-bold">{t('home.howItWorks.heading')}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-resy-red text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-0.5 text-sm text-neutral-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nothing recommended, nothing to show: a heading over an empty grid reads as a store
          with no tables left, which is the opposite of what an empty config means. */}
      {recommendations.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold">{t('home.restaurants.heading')}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {t('home.restaurants.subtitle', {
                  count: search.partySize,
                  guestLabel: t(search.partySize === 1 ? 'common.guest' : 'common.guests'),
                  date: formatDateHeading(search.date, i18n.language),
                })}
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((item) => (
              <article
                key={item.globalId}
                className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-lg"
              >
                <div className="flex h-48 items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                  {t('home.recommendations.comingSoon', { defaultValue: 'Photo coming soon' })}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5 text-left">
                  <h3 className="text-lg font-bold">
                    {t('home.recommendations.storeFallback', {
                      defaultValue: 'Store #{{id}}',
                      id: item.recommendStatNum,
                    })}
                  </h3>
                  <button
                    onClick={goToRestaurant}
                    className="mt-3 self-start rounded-lg border border-neutral-200 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red hover:bg-resy-red hover:text-white"
                  >
                    {t('common.viewAvailability')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={goToRestaurant}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-resy-red px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-resy-red/40 transition-transform hover:scale-105 hover:bg-red-600"
      >
        {t('home.hero.explore')}
      </button>
    </div>
  );
}
