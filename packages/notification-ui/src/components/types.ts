/** In-app notification item displayed by InAppNotification component. */
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  duration?: number;
  onClick?: () => void;
}
