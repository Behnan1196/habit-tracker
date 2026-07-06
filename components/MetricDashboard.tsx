import React from 'react';
import { useHabits } from '@/hooks/useHabits';
import { HabitItem } from '@/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

// Helper to get values for a metric habit for the current week
function getMetricValues(habit: HabitItem, weekKey: string, daysCount: number, getCellState: (habitId: string, dayIdx: number) => string) {
  const values: (number | null)[] = [];
  for (let i = 0; i < daysCount; i++) {
    const raw = getCellState(habit.id, i);
    const num = parseFloat(raw);
    values.push(isNaN(num) ? null : num);
  }
  return values;
}

export default function MetricDashboard() {
  const { state, getCellState, currentWeek } = useHabits();
  const metrics = state?.habits.filter(h => h.type === 'metric') ?? [];
  const daysCount = 7; // week view

  const data = Array.from({ length: daysCount }, (_, dayIdx) => {
    const entry: any = { day: `Day ${dayIdx + 1}` };
    metrics.forEach(metric => {
      const values = getMetricValues(metric, currentWeek ?? '', daysCount, getCellState);
      entry[metric.id] = values[dayIdx];
    });
    return entry;
  });

  return (
    <div style={{ padding: '24px' }}>
      <h2>Metric Dashboard</h2>
      {metrics.length === 0 && <p>No metric items defined.</p>}
      {metrics.length > 0 && (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            {metrics.map(metric => (
              <Line
                key={metric.id}
                type="monotone"
                dataKey={metric.id}
                stroke={metric.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
