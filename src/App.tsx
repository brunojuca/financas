import {
  ActionIcon,
  AppShell,
  Burger,
  Center,
  Group,
  Loader,
  NavLink,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import iconUrl from './assets/icon.svg';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowsExchange,
  IconBuildingBank,
  IconCategory,
  IconHome,
  IconMoon,
  IconRepeat,
  IconSettings,
  IconSun,
  IconTargetArrow,
} from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AccountsPage } from './features/accounts/AccountsPage';
import { BudgetPage } from './features/budget/BudgetPage';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { WelcomePage } from './features/welcome/WelcomePage';
import { t } from './i18n/pt-BR';
import { getMeta, META, requestPersistentStorage } from './storage/db';

const NAV = [
  { to: '/', label: t.nav.dashboard, icon: IconHome },
  { to: '/lancamentos', label: t.nav.transactions, icon: IconArrowsExchange },
  { to: '/contas', label: t.nav.accounts, icon: IconBuildingBank },
  { to: '/orcamento', label: t.nav.budget, icon: IconTargetArrow },
  { to: '/recorrentes', label: t.nav.recurring, icon: IconRepeat },
  { to: '/categorias', label: t.nav.categories, icon: IconCategory },
  { to: '/configuracoes', label: t.nav.settings, icon: IconSettings },
];

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');
  return (
    <Tooltip label={t.nav.toggleTheme}>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={t.nav.toggleTheme}
        onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}
      >
        {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

export function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  // null = not initialized yet, undefined = still loading
  const initialized = useLiveQuery(async () => (await getMeta(META.initialized)) ?? null, []);

  useEffect(() => {
    if (initialized) void requestPersistentStorage();
  }, [initialized]);

  if (initialized === undefined) {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }
  if (initialized === null) return <WelcomePage />;

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={{ base: 'sm', sm: 'lg' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={t.nav.toggleMenu}
            />
            <img src={iconUrl} alt="" width={28} height={28} />
            <Title order={3}>{t.appName}</Title>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={label}
            leftSection={<Icon size={20} stroke={1.6} />}
            active={to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)}
            onClick={close}
            style={{ borderRadius: 'var(--mantine-radius-md)' }}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/lancamentos" element={<TransactionsPage />} />
          <Route path="/contas" element={<AccountsPage />} />
          <Route path="/orcamento" element={<BudgetPage />} />
          <Route path="/recorrentes" element={<RecurringPage />} />
          <Route path="/categorias" element={<CategoriesPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
