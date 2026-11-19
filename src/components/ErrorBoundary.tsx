import { Alert, Button, Code, Container, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n/pt-BR';

interface State {
  error: Error | null;
}

/** Shows a recovery screen instead of a blank page when a render error escapes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local console only; nothing is reported anywhere.
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Container size="sm" py="xl">
        <Alert color="red" icon={<IconAlertTriangle size={20} />} title={t.crash.title}>
          <Stack gap="sm">
            <Text size="sm">{t.crash.text}</Text>
            <Button color="red" variant="light" w="fit-content" onClick={() => window.location.reload()}>
              {t.crash.reload}
            </Button>
            <Text size="xs" c="dimmed">
              {t.crash.details}
            </Text>
            <Code block>{error.message}</Code>
          </Stack>
        </Alert>
      </Container>
    );
  }
}
