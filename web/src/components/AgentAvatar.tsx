/// <reference types="vite/client" />
// Optional atlas: unfinished asset additions must not break packaged builds.
const people = Object.values(import.meta.glob('../assets/mascots/farm-family.png', { eager: true, query: '?url', import: 'default' }))[0] as string | undefined;
import coordinator from '../assets/mascots/coordinator-human.png';
import atlas from '../assets/mascots/friends-transparent.png';
import catalog from '../../../resources/mascot-catalog.json';
import { defaultAvatarId } from '../../../src/config/avatar';
import dog from '../assets/mascots/dog-transparent.png';
import otter from '../assets/mascots/otter-transparent.png';
import owl from '../assets/mascots/owl-transparent.png';
import owlC1 from '../assets/mascots/owl-c1.png';

const legacyIds = ['dog-a1', 'dog-a2', 'otter-b1', 'otter-b2', 'owl-c1', 'owl-c2'];
export const mascotOptions = catalog;
export const appMascot = owlC1;
export function AgentAvatar({ profile, avatarId, className = 'size-12' }: {
  profile: string; avatarId?: string; className?: string;
}) {
  const id = avatarId && catalog.some(item => item.id === avatarId) ? avatarId : defaultAvatarId(profile);
  if (id === 'coordinator-human') return <img src={coordinator} alt="" draggable={false} className={`shrink-0 object-contain ${className}`} />;
  const item = catalog.find(item => item.id === id);
  if (item?.humanAtlas && !people) return <img src={coordinator} alt="" draggable={false} className={`shrink-0 object-contain ${className}`} />;
  if (item?.humanAtlas) {
    const size = Math.max(item.width!, item.height!);
    return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${className}`}>
      <span style={{ width: `${item.width! / size * 100}%`, height: `${item.height! / size * 100}%`, backgroundImage: `url(${people})`, backgroundRepeat: 'no-repeat', backgroundSize: `${1448 / item.width! * 100}% ${1086 / item.height! * 100}%`, backgroundPosition: `${item.x! / (1448 - item.width!) * 100}% ${item.y! / (1086 - item.height!) * 100}%` }} />
    </span>;
  }
  if (item?.atlas) return <span aria-hidden="true" className={`block shrink-0 ${className}`}
    style={{ backgroundImage: `url(${atlas})`, backgroundSize: `${1374 / item.width! * 100}% ${1145 / item.height! * 100}%`, backgroundPosition: `${item.x! / (1374 - item.width!) * 100}% ${item.y! / (1145 - item.height!) * 100}%` }} />;
  const index = Math.max(0, legacyIds.indexOf(id));
  return <img src={[dog, otter, owl][Math.floor(index / 2)]} alt="" draggable={false}
    className={`shrink-0 object-contain ${className}`} style={{ transform: index % 2 ? 'scaleX(-1)' : undefined }} />;
}
