import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/nunito';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AppProvider } from './store.jsx';
import { I18nProvider } from './i18n/index.jsx';
import App from './App.jsx';
import { isNativeApp } from './api.js';

// Android hardware back button: navigate back, or leave the app from the home screen.
if (isNativeApp()) {
  import('@capacitor/app').then(({ App: NativeApp }) => {
    NativeApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.location.pathname !== '/') window.history.back();
      else NativeApp.exitApp();
    });
  }).catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>
);
