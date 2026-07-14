import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStoreData } from '../store/StoreDataContext';
import type { BookingMenu, MenuCategoryItem } from '../api/booking';
import { resolveActiveMenu } from '../lib/menuSchedule';
import { groupMultiMenus } from '../lib/menuGroups';
import { restaurantPhoto } from '../lib/restaurantImages';
import { menuItemPhoto } from '../lib/menuImages';

function MenuCategories({ menu, emptyLabel }: { menu: BookingMenu | null; emptyLabel: string }) {
  const categories: MenuCategoryItem[] = (menu?.categories ?? [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (categories.length === 0) {
    return <p className="text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {categories.map((category) => {
        const products = (category.products ?? [])
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (products.length === 0) return null;
        return (
          <section key={category.id}>
            <h3 className="mb-4 text-lg font-bold">{category.title}</h3>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="flex gap-4 rounded-2xl border border-neutral-200 p-4 transition-shadow hover:shadow-md"
                >
                  <img
                    src={product.imageUrl || menuItemPhoto(product.id)}
                    alt={product.title}
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <h4 className="font-semibold">{product.title}</h4>
                    {product.description && <p className="text-sm text-neutral-500">{product.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function MenuPage() {
  const { publicKey, data } = useStoreData();
  const { t, i18n } = useTranslation();
  const settings = data?.settings;
  const photoKey = settings?.sNum ?? 0;
  const isMultiMenu = settings?.isMultiMenu === 1;

  const multiMenuGroups = useMemo(
    () => (isMultiMenu ? groupMultiMenus(data?.reserMultiMenus ?? [], i18n.language) : []),
    [isMultiMenu, data, i18n.language],
  );
  const singleMenu = useMemo(
    () => (isMultiMenu ? null : resolveActiveMenu(data?.reserMultiMenus ?? [], data?.menu ?? null)),
    [isMultiMenu, data],
  );

  const storeName = settings?.storeName || t('restaurant.untitled', { defaultValue: 'Restaurant' });

  return (
    <div>
      <div
        className="flex h-56 items-end bg-cover bg-center sm:h-64"
        style={{
          backgroundImage: `linear-gradient(rgba(10,10,15,0.1), rgba(10,10,15,0.7)), url('${restaurantPhoto(
            photoKey,
          )}')`,
        }}
      >
        <div className="mx-auto w-full max-w-6xl px-6 pb-6 text-white">
          <Link to={`/${publicKey}/restaurant`} className="text-sm text-white/80 hover:text-white">
            ← {t('menu.back')}
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{t('menu.title', { name: storeName })}</h1>
          <p className="mt-1 text-sm text-white/85">{t('menu.subtitle')}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10 pb-28">
        {isMultiMenu ? (
          multiMenuGroups.length > 0 ? (
            <>
              <nav className="mb-8 flex flex-wrap gap-2">
                {multiMenuGroups.map((group) => (
                  <a
                    key={group.key}
                    href={`#menu-${group.key}`}
                    className="rounded-full border border-neutral-200 px-4 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
                  >
                    {group.label}
                  </a>
                ))}
              </nav>
              <div className="flex flex-col gap-14">
                {multiMenuGroups.map((group) => (
                  <section key={group.key} id={`menu-${group.key}`}>
                    <h2 className="mb-4 text-xl font-bold text-resy-red">{group.label}</h2>
                    <MenuCategories menu={group.menu} emptyLabel={t('menu.empty')} />
                  </section>
                ))}
              </div>
            </>
          ) : (
            <p className="text-neutral-500">{t('menu.empty')}</p>
          )
        ) : (
          <MenuCategories menu={singleMenu} emptyLabel={t('menu.empty')} />
        )}
      </div>

      <div className="fixed bottom-4 right-4 z-20 sm:inset-x-0 sm:bottom-0 sm:right-0 sm:border-t sm:border-neutral-200 sm:bg-white/95 sm:px-6 sm:py-3 sm:backdrop-blur">
        <div className="flex items-center gap-4 sm:mx-auto sm:max-w-6xl sm:justify-between">
          <p className="hidden text-sm font-medium text-neutral-700 sm:block">{t('menu.bookCta')}</p>
          <Link
            to={`/${publicKey}/restaurant`}
            className="rounded-xl bg-resy-red px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-resy-red/30 transition-colors hover:bg-red-600 sm:px-7 sm:py-3 sm:shadow-sm"
          >
            {t('menu.bookNow')}
          </Link>
        </div>
      </div>
    </div>
  );
}
