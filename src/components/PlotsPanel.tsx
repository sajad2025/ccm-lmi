import React from 'react';
import { Line } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';

interface PlotsPanelProps {
  functionChartData: ChartData<'line'>;
  derivativeChartData: ChartData<'line'>;
  chartOptions: ChartOptions<'line'>;
}

const PlotsPanel: React.FC<PlotsPanelProps> = ({
  functionChartData,
  derivativeChartData,
  chartOptions,
}) => {
  return (
    <div className="h-full bg-white p-8">
      <h2 className="text-xl font-semibold mb-6">Plots</h2>
      <div className="h-[calc(50%-2rem)] mb-4">
        <Line data={functionChartData} options={chartOptions} />
      </div>
      <div className="h-[calc(50%-2rem)]">
        <Line data={derivativeChartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default PlotsPanel; 