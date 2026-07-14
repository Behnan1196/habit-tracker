import { AuthGate } from '@/components/auth-gate';

export default function MetricsPage() {
  return <AuthGate view="metrics" />;
}
