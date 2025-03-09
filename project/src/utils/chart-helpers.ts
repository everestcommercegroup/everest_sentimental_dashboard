// Safe data transformation utilities
export const safeNumber = (value: unknown): number => {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const safeString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return '';
};

export const createSafeObject = <T extends Record<string, unknown>>(data: unknown, defaultValue: T): T => {
  if (data && typeof data === 'object') {
    return { ...defaultValue, ...data };
  }
  return defaultValue;
};

export const createPieData = (sentiment: { positive: number; negative: number; neutral: number }): PieDataPoint[] => {
  return [
    {
      id: 'positive',
      label: 'Positive',
      value: sentiment.positive,
      color: '#10B981'
    },
    {
      id: 'negative',
      label: 'Negative',
      value: sentiment.negative,
      color: '#EF4444'
    },
    {
      id: 'neutral',
      label: 'Neutral',
      value: sentiment.neutral,
      color: '#6B7280'
    }
  ];
};