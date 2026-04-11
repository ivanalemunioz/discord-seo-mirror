import { Hash, MessageSquareText, ShieldCheck, Megaphone } from 'lucide-react';

type Props = {
  kind?: 'text' | 'forum' | 'rules' | 'updates';
  className?: string;
};

export default function ChannelIcon({ kind = 'text', className = 'h-4 w-4' }: Props) {
  if (kind === 'forum') return <MessageSquareText className={className} aria-hidden="true" />;
  if (kind === 'rules') return <ShieldCheck className={className} aria-hidden="true" />;
  if (kind === 'updates') return <Megaphone className={className} aria-hidden="true" />;
  return <Hash className={className} aria-hidden="true" />;
}
