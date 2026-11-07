import { useState } from 'react';
import {
  cents,
  negate,
  parseMoneyInput,
  subtractCents,
  sumCents,
  type Cents,
} from '../../../domain/money';
import type { CompleteSetupInput } from '../../../app/use-cases';
import { AmountText, Button, ListRow, MoneyField, TextField } from '../../components';
import { TwoPane, type LayoutMode } from '../../layout';

interface DraftRecurringExpense {
  readonly id: string;
  readonly name: string;
  readonly amountText: string;
}

export interface SetupScreenProps {
  readonly layoutMode: LayoutMode;
  readonly onCompleteSetup: (input: CompleteSetupInput) => Promise<void>;
}

type SetupStep = 'welcome' | 'income' | 'expenses' | 'summary';

export function SetupScreen({ layoutMode, onCompleteSetup }: SetupScreenProps) {
  const [step, setStep] = useState<SetupStep>('welcome');
  const [monthlyIncomeText, setMonthlyIncomeText] = useState('');
  const [incomeAttempted, setIncomeAttempted] = useState(false);

  const [expenses, setExpenses] = useState<DraftRecurringExpense[]>([]);
  const [draftExpenseName, setDraftExpenseName] = useState('');
  const [draftExpenseAmountText, setDraftExpenseAmountText] = useState('');
  const [expenseAttempted, setExpenseAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedIncome = parseMoneyInput(monthlyIncomeText);
  const incomeCents: Cents = parsedIncome.ok ? parsedIncome.cents : cents(0);
  const incomeError = !parsedIncome.ok
    ? incomeAttempted || monthlyIncomeText.trim().length > 0
      ? parsedIncome.reason
      : null
    : null;

  const parsedDraftExpense = parseMoneyInput(draftExpenseAmountText);
  const draftExpenseNameTrimmed = draftExpenseName.trim();
  const draftExpenseError = !parsedDraftExpense.ok
    ? expenseAttempted || draftExpenseAmountText.trim().length > 0
      ? parsedDraftExpense.reason
      : null
    : null;
  const draftExpenseNameError =
    expenseAttempted && draftExpenseNameTrimmed.length === 0 ? 'Enter an expense name' : null;

  const validExpenses = expenses.flatMap((row) => {
    const parsed = parseMoneyInput(row.amountText);
    if (!parsed.ok || row.name.trim().length === 0) {
      return [];
    }
    return [{ id: row.id, name: row.name.trim(), amount: parsed.cents }];
  });

  const totalRecurringExpenses = sumCents(validExpenses.map((item) => item.amount));
  const purchasePowerAmount = subtractCents(incomeCents, totalRecurringExpenses);

  const handleContinueFromIncome = () => {
    setIncomeAttempted(true);
    if (!parsedIncome.ok) {
      return;
    }
    setStep('expenses');
  };

  const handleAddRecurringExpense = () => {
    setExpenseAttempted(true);
    if (draftExpenseNameTrimmed.length === 0 || !parsedDraftExpense.ok) {
      return;
    }
    setExpenses((prev) => [
      ...prev,
      {
        id: `setup-exp-${String(prev.length + 1)}-${String(Date.now())}`,
        name: draftExpenseNameTrimmed,
        amountText: draftExpenseAmountText.trim(),
      },
    ]);
    setDraftExpenseName('');
    setDraftExpenseAmountText('');
    setExpenseAttempted(false);
  };

  const handleRemoveRecurringExpense = (id: string) => {
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  };

  const handleContinueFromExpenses = () => {
    if (draftExpenseNameTrimmed.length > 0 || draftExpenseAmountText.trim().length > 0) {
      setExpenseAttempted(true);
      if (draftExpenseNameTrimmed.length === 0 || !parsedDraftExpense.ok) {
        return;
      }
      const nextRow: DraftRecurringExpense = {
        id: `setup-exp-${String(expenses.length + 1)}-${String(Date.now())}`,
        name: draftExpenseNameTrimmed,
        amountText: draftExpenseAmountText.trim(),
      };
      setExpenses((prev) => [...prev, nextRow]);
      setDraftExpenseName('');
      setDraftExpenseAmountText('');
      setExpenseAttempted(false);
    }
    setStep('summary');
  };

  const handleStartBudgeting = async () => {
    setIncomeAttempted(true);
    if (!parsedIncome.ok || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCompleteSetup({
        monthlyIncome: parsedIncome.cents,
        recurringExpenses: validExpenses.map((item) => ({
          name: item.name,
          amount: item.amount,
        })),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const summaryCard = (
    <section className="sb-card" aria-label="Budget plan summary">
      <h2 className="sb-section-heading">Budget plan summary</h2>
      <div className="sb-list">
        <ListRow
          title="Monthly income"
          trailing={<AmountText amount={incomeCents} sign="always" />}
        />
        <ListRow
          title="Recurring expenses"
          trailing={<AmountText amount={negate(totalRecurringExpenses)} sign="auto" />}
        />
        <ListRow
          title={<strong>Purchase power</strong>}
          trailing={<AmountText amount={purchasePowerAmount} sign="auto" />}
        />
      </div>
      {validExpenses.length > 0 ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="sb-section-heading">Included recurring expenses</h3>
          <div className="sb-list">
            {validExpenses.map((expense) => (
              <ListRow
                key={expense.id}
                title={expense.name}
                trailing={<AmountText amount={negate(expense.amount)} sign="always" />}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );

  const stepCard = (
    <section className="sb-card" aria-label="First-run setup">
      {step === 'welcome' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p className="sb-section-heading">Welcome</p>
            <h2 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--text-xl)' }}>
              Your data stays on this phone.
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
              No accounts, no bank logins, and no servers. Set your monthly income and recurring
              expenses once, then log what you spend by hand.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              onClick={() => {
                setStep('income');
              }}
            >
              Get started
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'income' ? (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          onSubmit={(event) => {
            event.preventDefault();
            handleContinueFromIncome();
          }}
        >
          <div>
            <p className="sb-section-heading">Step 1 of 3</p>
            <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)' }}>
              What is your monthly income?
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
              Your take-home pay added at the start of every month.
            </p>
          </div>

          <TextField
            label="Monthly income"
            inputMode="decimal"
            placeholder="5,000.00"
            value={monthlyIncomeText}
            error={incomeError}
            onChange={(value) => {
              setMonthlyIncomeText(value);
            }}
          />

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('welcome');
              }}
            >
              Back
            </Button>
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'expenses' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p className="sb-section-heading">Step 2 of 3</p>
            <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)' }}>
              Recurring expenses
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
              Bills subtracted automatically each month, like rent or phone. You can skip this if
              you have none.
            </p>
          </div>

          {validExpenses.length > 0 ? (
            <div className="sb-list" role="list" aria-label="Recurring expenses list">
              {validExpenses.map((expense) => (
                <div key={expense.id} className="sb-list-row" role="listitem">
                  <span>{expense.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <AmountText amount={negate(expense.amount)} sign="always" />
                    <Button
                      variant="quiet"
                      aria-label={`Remove ${expense.name}`}
                      onClick={() => {
                        handleRemoveRecurringExpense(expense.id);
                      }}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
              alignItems: 'start',
            }}
          >
            <TextField
              label="Expense name"
              placeholder="Rent"
              value={draftExpenseName}
              error={draftExpenseNameError}
              onChange={setDraftExpenseName}
            />
            <MoneyField
              label="Expense amount"
              placeholder="1,800.00"
              value={draftExpenseAmountText}
              showErrorWhenTouched={false}
              onChange={(nextValue) => {
                setDraftExpenseAmountText(nextValue);
              }}
            />
          </div>
          {draftExpenseError ? (
            <p role="alert" className="sb-field-error">
              {draftExpenseError}
            </p>
          ) : null}

          <div>
            <Button variant="secondary" onClick={handleAddRecurringExpense}>
              Add recurring expense
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('income');
              }}
            >
              Back
            </Button>
            <Button variant="primary" onClick={handleContinueFromExpenses}>
              Review plan
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'summary' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p className="sb-section-heading">Step 3 of 3</p>
            <h2 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-lg)' }}>
              Ready to start budgeting
            </h2>
            <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
              Your purchase power is what remains each month after recurring expenses.
            </p>
          </div>

          {layoutMode === 'compact' ? summaryCard : null}

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('expenses');
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              disabled={isSubmitting}
              onClick={() => {
                void handleStartBudgeting();
              }}
            >
              Start budgeting
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  if (layoutMode === 'expanded') {
    return (
      <TwoPane
        leftLabel="Setup step pane"
        rightLabel="Setup summary pane"
        left={stepCard}
        right={summaryCard}
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Single column layout"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {stepCard}
    </div>
  );
}
