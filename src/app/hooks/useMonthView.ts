import { useEffect, useState } from 'react';
import type { MonthKey } from '../../domain/calendar';
import type { MonthStatement } from '../../domain/ledger';
import type { SimpleBudgetDatabase } from '../../data/database';
import { getMonthView } from '../use-cases';

export function observeMonthView(
  db: SimpleBudgetDatabase,
  month: MonthKey,
  onStatement: (statement: MonthStatement) => void,
): () => void {
  let cancelled = false;

  const refresh = () => {
    void getMonthView({ db }, month).then((statement) => {
      if (!cancelled) {
        onStatement(statement);
      }
    });
  };

  refresh();
  const unsubscribe = db.subscribe(refresh);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export function useMonthView(db: SimpleBudgetDatabase, month: MonthKey): MonthStatement | null {
  const [statement, setStatement] = useState<MonthStatement | null>(null);

  useEffect(() => {
    return observeMonthView(db, month, setStatement);
  }, [db, month]);

  return statement;
}
