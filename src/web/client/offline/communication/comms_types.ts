const SET_ACTIVE = "SetActive";
const PREPARE_OFFLINE = "PrepareOffline";
const CHANNELS = new Set<unknown>([SET_ACTIVE, PREPARE_OFFLINE]);
export type Channel = typeof SET_ACTIVE | typeof PREPARE_OFFLINE;

export function isSwChannel(x: unknown): x is Channel {
  return CHANNELS.has(x);
}

export interface BaseMessage<T extends Channel, U> {
  channel: T;
  data: U;
}

export interface SetActiveRequest {
  isActive: boolean;
}

export interface PrepareOfflineRequest {
  resource: string;
}

type ChannelRequestType<T extends Channel> = T extends "SetActive"
  ? SetActiveRequest
  : T extends "PrepareOffline"
  ? PrepareOfflineRequest
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
