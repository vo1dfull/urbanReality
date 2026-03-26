import React from 'react';

const InfoPanel = ({ data }) => {
  // Safe access to data with fallbacks
  const rainProb = data?.rainProbability || 0; // Probability in %
  const rainfall = data?.rainfall || 0;        // Volume in mm
  const aqi = data?.aqi || 45;                 // AQI value
  const city = data?.city || 'City Name';      // City name
  const condition = data?.condition || 'Clear Sky'; // Weather condition

  return (
    <div className="w-full max-w-sm p-4 rounded-2xl shadow-lg transition-colors duration-300 bg-white dark:bg-slate-800 dark:border dark:border-slate-700">
      
      {/* Header Section */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          {city}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {condition}
        </p>
      </div>

      {/* AQI Box */}
      <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-emerald-900/30 dark:to-green-900/30 border border-green-100 dark:border-emerald-800">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
              Air Quality
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {aqi} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">AQI</span>
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-green-200 dark:bg-green-700/50 flex items-center justify-center">
            <span className="text-green-700 dark:text-green-300 text-xl">💨</span>
          </div>
        </div>
      </div>

      {/* Rain Probability & Rainfall Section */}
      <div className="mb-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300">
              <span className="text-lg">🌧️</span>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Rain Chance</span>
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">{rainProb}%</span>
        </div>
        
        {/* Divider */}
        <div className="h-px w-full bg-blue-200 dark:bg-blue-800 my-2"></div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300">
              <span className="text-lg">💧</span>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Volume</span>
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">{rainfall.toFixed(1)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">mm</span></span>
        </div>
      </div>

    </div>
  );
};

export default InfoPanel;