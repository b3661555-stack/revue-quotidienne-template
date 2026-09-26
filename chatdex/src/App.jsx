import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './store.jsx';
import { BottomNav, ErrorState, OfflineBanner, Spinner, Toasts } from './components/ui.jsx';
import Welcome from './pages/Welcome.jsx';
import Home from './pages/Home.jsx';
import Capture from './pages/Capture.jsx';
import Dex from './pages/Dex.jsx';
import CatProfile from './pages/CatProfile.jsx';
import Profile from './pages/Profile.jsx';
import EditProfile from './pages/EditProfile.jsx';
import Notifications from './pages/Notifications.jsx';
import { HuntDetail, Hunts } from './pages/Hunts.jsx';
import Achievements from './pages/Achievements.jsx';
import Follows from './pages/Follows.jsx';

const Explore = lazy(() => import('./pages/Explore.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const { me, booting, bootError, boot } = useApp();
  const { pathname } = useLocation();

  if (booting) return <div className="app-shell"><div className="boot"><div className="boot-logo">🐱</div><Spinner /></div></div>;
  if (bootError && !me) return <div className="app-shell"><ErrorState error={bootError} onRetry={boot} /></div>;
  if (!me) {
    return (
      <div className="app-shell">
        <OfflineBanner />
        <Welcome />
        <Toasts />
      </div>
    );
  }
  const hideNav = pathname.startsWith('/capture');
  return (
    <div className={`app-shell ${hideNav ? '' : 'with-nav'}`}>
      <ScrollToTop />
      <OfflineBanner />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/dex" element={<Dex />} />
          <Route path="/cat/:id" element={<CatProfile />} />
          <Route path="/me" element={<Navigate to={`/u/${me.user.username}`} replace />} />
          <Route path="/me/edit" element={<EditProfile />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/u/:username/follows" element={<Follows />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/hunts" element={<Hunts />} />
          <Route path="/hunts/:id" element={<HuntDetail />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!hideNav && <BottomNav />}
      <Toasts />
    </div>
  );
}
