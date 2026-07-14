import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { StoreInfo } from '../api/types';
import { restaurantCuisine, restaurantPhoto } from '../lib/restaurantImages';

interface Props {
  store: StoreInfo;
  onReserve: () => void;
}

export default function RestaurantCard({ store, onReserve }: Props) {
  const { t } = useTranslation();
  const location = [store.city, store.prov].filter(Boolean).join(', ');

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative h-48 overflow-hidden">
        <img
          src={restaurantPhoto(store.storenum)}
          alt={store.description ?? `Store ${store.storenum}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700">
          {restaurantCuisine(store.storenum)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5 text-left">
        <button onClick={onReserve} className="text-left">
          <h3 className="text-lg font-bold transition-colors group-hover:text-resy-red">
            {store.description ?? `Store ${store.storenum}`}
          </h3>
        </button>
        <p className="text-sm text-neutral-500">
          {location || store.address1 || 'Address available upon booking'}
        </p>
        {store.phone && <p className="text-sm text-neutral-500">{store.phone}</p>}

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onReserve}
            className="self-start rounded-lg border border-neutral-200 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red hover:bg-resy-red hover:text-white"
          >
            {t('common.viewAvailability')}
          </button>
          <Link
            to={`/restaurant/${store.storenum}/menu`}
            className="rounded-lg border border-neutral-200 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red hover:bg-resy-red hover:text-white"
          >
            {t('common.viewMenu')}
          </Link>
        </div>
      </div>
    </article>
  );
}
