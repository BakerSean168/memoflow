export interface ReminderGroupFormModel {
  id?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  enabled?: boolean;
  order?: number;
}
