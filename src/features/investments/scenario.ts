import type { Scenario } from '../../domain/fixedIncome/focus';
import { formatPercent } from '../../domain/money';
import { t } from '../../i18n/pt-BR';

export type ScenarioChoice = keyof typeof t.investments.scenarios;

export function choiceOf(s: Scenario): ScenarioChoice {
  if (s.kind === 'custom') return 'custom';
  return s.selicShift > 0 ? 'up' : s.selicShift < 0 ? 'down' : 'focus';
}

/** Short description of the scenario, for the note on the portfolio tab. */
export function scenarioText(s: Scenario): string {
  if (s.kind === 'custom')
    return `${t.investments.scenarios.custom} (Selic ${formatPercent(s.selic)}, IPCA ${formatPercent(s.ipca)})`;
  return t.investments.scenarios[choiceOf(s)];
}
