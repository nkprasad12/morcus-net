import type { OfflineSettings } from "@/web/client/offline/offline_settings_storage";

const OFFLINE_SETTING_TOGGLED = "OfflineSettingToggled";
const CHANNELS = new Set<unknown>([OFFLINE_SETTING_TOGGLED]);
export type Channel = typeof OFFLINE_SETTING_TOGGLED;

export function isSwChannel(x: unknown): x is Channel {
  return CHANNELS.has(x);
}

export interface BaseMessage<T extends Channel, U> {
  channel: T;
  data: U;
}

export interface OfflineSettingToggledReqest {
  settingKey: keyof OfflineSettings;
  desiredValue: boolean;
}

type ChannelRequestType<T extends Channel> = T extends "OfflineSettingToggled"
  ? OfflineSettingToggledReqest
  : never;

export type ChannelRequest<T extends Channel> = BaseMessage<
  T,
  ChannelRequestType<T>
>;

export interface BaseResponse {
  progress?: number;
  complete?: true;
  success?: boolean;
}

export type ChannelResponse<
  T extends Channel,
  U extends object = BaseResponse
> = BaseMessage<T, U> & { req: ChannelRequest<T> };
