import { useComputedColorScheme, useMantineTheme, type MantineTheme } from '@mantine/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

// Only the pieces we use are bundled (tree-shaken).
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type ChartOption = echarts.EChartsCoreOption;

const PALETTE = [
  'cyan',
  'orange',
  'grape',
  'lime',
  'indigo',
  'pink',
  'yellow',
  'teal',
  'violet',
  'blue',
  'green',
  'red',
];

/** Maps the Mantine theme (colors, font, light/dark) to an ECharts theme so charts match the app. */
function echartsTheme(theme: MantineTheme, scheme: 'light' | 'dark') {
  const dark = scheme === 'dark';
  const shade = dark ? 5 : 6;
  const text = dark ? theme.colors.dark[0] : theme.black;
  const dimmed = dark ? theme.colors.dark[2] : theme.colors.gray[6];
  const border = dark ? theme.colors.dark[4] : theme.colors.gray[3];
  const grid = dark ? theme.colors.dark[5] : theme.colors.gray[2];
  return {
    color: PALETTE.map((c) => theme.colors[c]![shade]),
    backgroundColor: 'transparent',
    textStyle: { color: text, fontFamily: theme.fontFamily },
    legend: { textStyle: { color: text } },
    tooltip: {
      backgroundColor: dark ? theme.colors.dark[7] : theme.white,
      borderColor: border,
      textStyle: { color: text },
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: dimmed },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisLabel: { color: dimmed },
      splitLine: { lineStyle: { color: grid } },
    },
  };
}

interface ChartProps {
  option: ChartOption;
  height?: number;
  'aria-label': string;
}

export function Chart({ option, height = 300, ...rest }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme('light');

  // (Re)create the chart when the color scheme changes: ECharts themes are fixed at init.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, echartsTheme(theme, scheme), { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [theme, scheme]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option, theme, scheme]);

  return (
    <div ref={containerRef} role="img" aria-label={rest['aria-label']} style={{ width: '100%', height }} />
  );
}
