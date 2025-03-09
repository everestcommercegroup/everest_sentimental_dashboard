/// <reference types="vite/client" />

// Add type declarations for chart data
interface ChartDataPoint {
  month: string;
  positive: number;
  negative: number;
  neutral: number;
}

interface PieDataPoint {
  id: string;
  label: string;
  value: number;
  color: string;
}