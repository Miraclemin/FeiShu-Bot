import catalog from '../../../resources/mascot-catalog.json';
import { defaultAvatarId } from '../../../src/config/avatar';
import dogA1 from '../assets/mascots/dog-a1.png';
import dogA2 from '../assets/mascots/dog-a2.png';
import otterB1 from '../assets/mascots/otter-b1.png';
import otterB2 from '../assets/mascots/otter-b2.png';
import owlC1 from '../assets/mascots/owl-c1.png';
import owlC2 from '../assets/mascots/owl-c2.png';

const images: Record<string, string> = {
  'dog-a1': dogA1, 'dog-a2': dogA2, 'otter-b1': otterB1,
  'otter-b2': otterB2, 'owl-c1': owlC1, 'owl-c2': owlC2,
};
export const mascotOptions = catalog;
export const appMascot = owlC1;
export function AgentAvatar({ profile, avatarId, className = 'size-12' }: {
  profile: string; avatarId?: string; className?: string;
}) {
  const id = avatarId && images[avatarId] ? avatarId : defaultAvatarId(profile);
  return <img src={images[id]} alt="" draggable={false}
    className={`shrink-0 rounded-2xl object-cover ring-1 ring-black/5 ${className}`} />;
}
