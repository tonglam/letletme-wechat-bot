export type ResolvedWechatTarget = {
  alias: string;
  userId: string;
  contextToken: string;
};

export type StoredWechatTarget = ResolvedWechatTarget & {
  updatedAt?: string | undefined;
};

export interface WechatTargetRegistry {
  resolveAliases(aliases: string[]): Promise<ResolvedWechatTarget[]>;
  upsert(target: StoredWechatTarget): Promise<StoredWechatTarget>;
  list(): Promise<StoredWechatTarget[]>;
  remove(alias: string): Promise<boolean>;
}
