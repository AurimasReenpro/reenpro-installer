import { useEffect, useState } from 'react';
import type { Database } from '../../types/database.types';

type TimeEntry = Database['public']['Tables']['time_entries']['Row'];

export default function LiveTimer({ entries, installerId }: { entries: TimeEntry[], installerId: string | undefined }) {
  const [elapsed, setElapsed] = useState('0h 0min 0s');

  useEffect(() => {
    if (!entries || entries.length === 0 || !installerId) return;

    // Filter time entries for the current installer only
    const myEntries = entries.filter(e => e.installer_id === installerId);

    const updateTimer = () => {
      let totalMilliseconds = 0;
      const now = new Date().getTime();
      let hasCountedOpen = false;

      // Sort by start_time so we process oldest to newest
      const sortedEntries = [...myEntries].sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      sortedEntries.forEach(entry => {
        const start = new Date(entry.start_time).getTime();
        if (entry.end_time) {
          // Closed segment: use recorded start and end
          const end = new Date(entry.end_time).getTime();
          totalMilliseconds += Math.max(0, end - start);
        } else {
          // Open segment (currently running): use start and now
          // Only count one open entry to prevent 2x/3x speed bugs if DB has anomalies
          if (!hasCountedOpen) {
            totalMilliseconds += Math.max(0, now - start);
            hasCountedOpen = true;
          }
        }
      });

      const hours = Math.floor(totalMilliseconds / (1000 * 60 * 60));
      const minutes = Math.floor((totalMilliseconds / (1000 * 60)) % 60);
      const seconds = Math.floor((totalMilliseconds / 1000) % 60);

      setElapsed(`${hours}h ${minutes}min ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [entries, installerId]);

  return <span>{elapsed}</span>;
}
