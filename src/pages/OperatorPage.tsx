/**
 * OperatorPage — wraps OperatorDashboard with the TradingBotProvider.
 */

import React from 'react';
import { TradingBotProvider } from '@/contexts/TradingBotContext';
import { OperatorDashboard } from '@/components/operator-dashboard/OperatorDashboard';

export default function OperatorPage() {
  return (
    <TradingBotProvider>
      <OperatorDashboard />
    </TradingBotProvider>
  );
}