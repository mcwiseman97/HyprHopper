export type ItemStatus = 'backlog' | 'important' | 'reviewed' | 'dig_deeper';
export type ItemType = 'url' | 'image' | 'text_snippet' | 'file' | 'note';

export interface HopperItem {
  id: string;
  title: string;
  note?: string;
  type: ItemType;
  content?: string;
  file_path?: string;
  tags: string[];
  status: ItemStatus;
  created_at: string;
  reviewed_at?: string;
}

export interface NewItem {
  title: string;
  note?: string | null;
  type: ItemType;
  content?: string | null;
  file_path?: string | null;
  tags: string[];
  status?: ItemStatus;
}

export interface BacklogCount {
  total: number;
  important: number;
  ill_get_to: number;
}
