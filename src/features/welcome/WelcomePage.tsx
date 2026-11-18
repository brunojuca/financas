import {
  Button,
  Container,
  FileButton,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import iconUrl from '../../assets/icon.svg';
import { IconDatabaseImport, IconFlask, IconSparkles } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { currentMonth } from '../../domain/dates';
import { t } from '../../i18n/pt-BR';
import { initializeWithSeed, loadDemoData } from '../../storage/repo';
import { importBackupFile } from '../settings/backupActions';

function Option({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <Paper>
      <Stack h="100%" justify="space-between">
        <Stack gap="xs">
          <ThemeIcon size="lg" variant="light">
            {icon}
          </ThemeIcon>
          <Text fw={600}>{title}</Text>
          <Text size="sm" c="dimmed">
            {text}
          </Text>
        </Stack>
        {action}
      </Stack>
    </Paper>
  );
}

export function WelcomePage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <img src={iconUrl} alt="" width={40} height={40} />
          <Title order={1}>{t.welcome.title}</Title>
        </Group>
        <Text c="dimmed">{t.welcome.intro}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Option
            icon={<IconSparkles size={20} />}
            title={t.welcome.seedTitle}
            text={t.welcome.seedText}
            action={<Button onClick={() => void initializeWithSeed()}>{t.welcome.start}</Button>}
          />
          <Option
            icon={<IconDatabaseImport size={20} />}
            title={t.welcome.importTitle}
            text={t.welcome.importText}
            action={
              <FileButton onChange={(f) => void importBackupFile(f, false)} accept="application/json,.json">
                {(props) => (
                  <Button variant="light" {...props}>
                    {t.welcome.chooseFile}
                  </Button>
                )}
              </FileButton>
            }
          />
          <Option
            icon={<IconFlask size={20} />}
            title={t.welcome.demoTitle}
            text={t.welcome.demoText}
            action={
              <Button variant="default" onClick={() => void loadDemoData(currentMonth())}>
                {t.welcome.loadDemo}
              </Button>
            }
          />
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
