export type NavChannel = {
  id: string;
  name: string;
  slug: string;
  count: number;
  totalPages?: number;
  category?: string | null;
  channelType?: number;
  iconKind?: 'text' | 'forum' | 'rules' | 'updates';
};
