export type IRateLimit = {
  identifier: string;
  method: string;
  period: string;
  count: number;
  time?: Date;
  expireAt?: Date;
};

export enum RateLimitTimes {
  None = 0,
  Second = 1000,
  Minute = RateLimitTimes.Second * 60,
  Hour = RateLimitTimes.Minute * 60,
  Day = RateLimitTimes.Hour * 24,
  Month = RateLimitTimes.Day * 30,
  Year = RateLimitTimes.Day * 365
}
