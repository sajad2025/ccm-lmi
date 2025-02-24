import React from 'react';

interface SettingsPanelProps {
  functionExpression: string;
  setFunctionExpression: (value: string) => void;
  derivative: string;
  error: string;
  thetaMin: number;
  setThetaMin: (value: number) => void;
  thetaMax: number;
  setThetaMax: (value: number) => void;
  duration: number;
  setDuration: (value: number) => void;
  sampleTime: number;
  setSampleTime: (value: number) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  functionExpression,
  setFunctionExpression,
  derivative,
  error,
  thetaMin,
  setThetaMin,
  thetaMax,
  setThetaMax,
  duration,
  setDuration,
  sampleTime,
  setSampleTime,
}) => {
  return (
    <div className="h-full bg-gray-50 p-8 border-r">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">Function</label>
          <input
            type="text"
            value={functionExpression}
            onChange={(e) => setFunctionExpression(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>

        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">Derivative</label>
          <input
            type="text"
            value={derivative}
            readOnly
            className="border rounded px-2 py-1 bg-gray-50"
          />
        </div>

        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">theta min</label>
          <input
            type="number"
            value={thetaMin}
            onChange={(e) => setThetaMin(Number(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </div>

        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">max</label>
          <input
            type="number"
            value={thetaMax}
            onChange={(e) => setThetaMax(Number(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </div>

        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">duration</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={0.1}
            step={0.1}
            className="border rounded px-2 py-1"
          />
        </div>

        <div className="grid grid-cols-[120px,1fr] gap-2 items-center">
          <label className="text-right">dt</label>
          <input
            type="number"
            value={sampleTime}
            onChange={(e) => setSampleTime(Number(e.target.value))}
            min={0.001}
            step={0.001}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel; 