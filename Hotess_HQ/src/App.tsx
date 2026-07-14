import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './store/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { StoreLayout, StoreIndexRedirect } from './pages/StoreLayout';
import { CheckinScreen } from './pages/CheckinScreen';
import { BookingFormScreen } from './pages/BookingFormScreen';
import { SeatingScreen } from './pages/SeatingScreen';
import { WaitlistScreen } from './pages/WaitlistScreen';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/:publicKey" element={<StoreLayout />}>
                <Route index element={<StoreIndexRedirect />} />
                <Route path="checkin" element={<CheckinScreen />} />
                <Route path="booking" element={<BookingFormScreen />} />
                <Route path="seating" element={<SeatingScreen />} />
                <Route path="waitlist" element={<WaitlistScreen />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
