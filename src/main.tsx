import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import 'dayjs/locale/pt-br';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { t } from './i18n/pt-BR';
import { theme } from './theme';

// Typed dates (DD/MM/YYYY) are parsed with the input's format; without this plugin dayjs reads them month-first.
dayjs.extend(customParseFormat);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        <ModalsProvider labels={{ confirm: t.common.confirm, cancel: t.common.cancel }}>
          <Notifications position="top-center" />
          <HashRouter>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </HashRouter>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
