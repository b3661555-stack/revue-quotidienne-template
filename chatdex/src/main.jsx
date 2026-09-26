import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/nunito';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { AppProvider } from './store.jsx';
import { I18nProvider } from './i18n/index.jsx';
import App from './App.jsx';

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
