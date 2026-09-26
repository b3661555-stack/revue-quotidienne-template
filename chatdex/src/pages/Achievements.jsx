import { useApi } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { ErrorState, Page, ProgressBar, Spinner, TopBar } from '../components/ui.jsx';

// Progress hints for badges with a countable goal.
const PROGRESS = {
  cats_10: (s) => [s.cats, 10], cats_50: (s) => [s.cats, 50], cats_100: (s) => [s.cats, 100],
  expert_spotter: (s) => [s.rare, 5], explorer: (s) => [s.regions, 3], swiss_collector: (s) => [s.swissCats, 10], pack_member: (s) => [s.following, 3],
};

export default function Achievements() {
  const t = useT();
  const { data, error, loading, reload } = useApi('/achievements');
  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><TopBar back title={t('badges.title')} /><ErrorState error={error} onRetry={reload} /></Page>;
  const unlocked = data.achievements.filter((a) => a.unlockedAt).length;
  return (
    <Page>
      <TopBar back title={t('badges.title')} />
      <div className="card">
        <div className="row between"><strong>{t('badges.unlocked')}</strong><span><strong>{unlocked}</strong>/{data.achievements.length}</span></div>
        <ProgressBar value={unlocked} max={data.achievements.length} />
      </div>
      <div className="achievement-grid">
        {data.achievements.map((a) => {
          const p = PROGRESS[a.id]?.(data.stats);
          return (
            <div key={a.id} className={`achievement ${a.unlockedAt ? 'unlocked' : 'locked'}`}>
              <span className="achievement-icon">{a.icon}</span>
              <strong>{t(`ach.${a.id}.name`)}</strong>
              <span className="muted small">{t(`ach.${a.id}.desc`)}</span>
              {a.unlockedAt ? <span className="tiny unlocked-date">{t('badges.unlockedOn', { date: t.date(a.unlockedAt) })}</span>
                : p && <><ProgressBar value={Math.min(p[0], p[1])} max={p[1]} /><span className="tiny muted">{Math.min(p[0], p[1])}/{p[1]}</span></>}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
