import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { HealthInfo } from '../lib/types';
import { PageHead, fmt } from '../components/ui';
import { VoterRecordsPanel } from '../components/VoterRecordsPanel';

export default function Voters() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    if (user?.isGlobal) api.get<HealthInfo>('/api/health').then(setHealth).catch(() => {});
  }, [user?.isGlobal]);

  return (
    <>
      <PageHead
        title="Electoral Roll Directory"
        sub={user?.isGlobal
          ? `வாக்காளர் பட்டியல் · ${health ? fmt(health.counts.liveVoters) : '—'} electors`
          : `Electors inside your ${user?.partCount} assigned booth${user?.partCount === 1 ? '' : 's'}`}
      />
      <VoterRecordsPanel />
    </>
  );
}
