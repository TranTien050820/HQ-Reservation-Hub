import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReview, saveReview } from '../lib/reviews';

interface Props {
  bookingId: number;
}

const STARS = [1, 2, 3, 4, 5];

export default function BookingReview({ bookingId }: Props) {
  const { t } = useTranslation();
  const [review, setReview] = useState(() => getReview(bookingId));
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);

  if (review) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
        <div aria-hidden className="flex text-amber-500">
          {STARS.map((n) => (
            <span key={n}>{n <= review.rating ? '★' : '☆'}</span>
          ))}
        </div>
        <span className="text-neutral-600">{t('myBookings.reviewThanks')}</span>
      </div>
    );
  }

  const handleSubmit = () => {
    if (rating === 0) return;
    const newReview = { rating, comment: comment.trim(), createdAt: new Date().toISOString() };
    saveReview(bookingId, newReview);
    setReview(newReview);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
      >
        {t('myBookings.reviewPrompt')}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-medium">{t('myBookings.reviewPrompt')}</p>
      <div className="mt-2 flex gap-1 text-2xl leading-none text-amber-400">
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${n}`}
            className="transition-transform hover:scale-110"
          >
            {n <= (hoverRating || rating) ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder={t('myBookings.reviewPlaceholder')}
        className="mt-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-resy-red focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={rating === 0}
        className="mt-2 rounded-lg bg-resy-red px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
      >
        {t('myBookings.reviewSubmit')}
      </button>
    </div>
  );
}
