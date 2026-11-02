import { useParams } from 'react-router-dom';
import { MemberReputationView } from '../features/reviews/MemberReputationView';

export function MemberReputationPage() {
  const { id } = useParams();
  if (!id) return null;
  return <MemberReputationView memberId={id} isOwnerView={false} />;
}
