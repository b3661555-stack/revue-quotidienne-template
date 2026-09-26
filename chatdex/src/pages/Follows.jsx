import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../store.jsx';
import { Avatar, EmptyState, ErrorState, Page, Segmented, Spinner, TopBar } from '../components/ui.jsx';

export default function Follows() {
  const { username } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'following' ? 'following' : 'followers';
  const { data, error, loading, reload } = useApi(`/users/${username}/follows`);
  const list = data?.[tab] || [];
  return (
    <Page>
      <TopBar back title={`@${username}`} />
      <Segmented value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={[{ value: 'followers', label: 'Followers' }, { value: 'following', label: 'Following' }]} />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !list.length && <EmptyState icon="👥" title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />}
      <ul className="user-list">
        {list.map((u) => (
          <li key={u.id}>
            <Link to={`/u/${u.username}`} className="user-row">
              <Avatar user={u} size={44} />
              <span className="grow"><strong>{u.displayName}</strong><span className="muted small block">@{u.username} · {u.title} · Lv {u.level}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
