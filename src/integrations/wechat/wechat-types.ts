export type WechatCredentials = {
  token: string;
  accountId: string;
  userId: string;
  baseUrl: string;
  savedAt: string;
};

export type BaseInfo = {
  channel_version: string;
};

export type PendingQrStatus = "wait" | "scaned" | "confirmed" | "expired";

export type CdnMedia = {
  encrypt_query_param: string;
  aes_key: string;
  encrypt_type: 1;
};

export type WireTextItem = {
  type: 1;
  text_item: {
    text: string;
  };
};

export type WireImageItem = {
  type: 2;
  image_item: {
    media: CdnMedia;
    mid_size: number;
  };
};

export type WireMessageItem = WireTextItem | WireImageItem;

export type WireMessage = {
  from_user_id: string;
  to_user_id: string;
  client_id: string;
  create_time_ms?: number;
  message_type: number;
  message_state: number;
  context_token: string;
  item_list: WireMessageItem[];
};

export const USER_MESSAGE_TYPE = 1;
export const BOT_MESSAGE_TYPE = 2;
export const MESSAGE_STATE_FINISH = 2;
export const IMAGE_MEDIA_TYPE = 1;
