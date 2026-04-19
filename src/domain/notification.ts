export type NotificationTarget = string;

export type TextNotification = {
  type: "text";
  targets: NotificationTarget[];
  text: string;
};

export type ImageNotification = {
  type: "image";
  targets: NotificationTarget[];
  imageUrl: string;
  caption?: string | undefined;
};

export type NotificationRequest = TextNotification | ImageNotification;

export type NotificationFailure = {
  target: NotificationTarget;
  message: string;
};

export type NotificationResult = {
  status: "success" | "partial_failure";
  notificationType: NotificationRequest["type"];
  requestedCount: number;
  deliveredCount: number;
  failedCount: number;
  failures: NotificationFailure[];
};
