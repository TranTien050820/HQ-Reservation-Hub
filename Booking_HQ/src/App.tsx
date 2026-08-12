import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import StoreLayout from './components/StoreLayout';
import NoStorePage from './pages/NoStorePage';
import HomePage from './pages/HomePage';
import RestaurantPage from './pages/RestaurantPage';
import MenuPage from './pages/MenuPage';
import BookPage from './pages/BookPage';
import ConfirmationPage from './pages/ConfirmationPage';
import MyBookingsPage from './pages/MyBookingsPage';
import BookingDetailPage from './pages/BookingDetailPage';
import PreOrderPage from './pages/PreOrderPage';

/** Browsers keep scroll position across client-side navigations; jump to the top on every new page. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<NoStorePage />} />
        <Route path="/:publicKey" element={<StoreLayout />}>
          <Route index element={<HomePage />} />
          <Route path="restaurant" element={<RestaurantPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="confirmation/:id" element={<ConfirmationPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="preorder/:reservationNo" element={<PreOrderPage />} />
        </Route>
        <Route path="*" element={<NoStorePage />} />
      </Routes>
    </>
  );
}
