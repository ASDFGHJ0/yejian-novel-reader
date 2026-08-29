import { registerPlugin } from "@capacitor/core";

export type NativeTtsEvent = {
  state: "sentence" | "completed" | "error";
  session: number;
  index?: number;
  message?: string;
};

type ListenerHandle = { remove: () => Promise<void> };

interface BackgroundTtsPlugin {
  start(options: { texts: string[]; rate: number; session: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: "stateChange", listener: (event: NativeTtsEvent) => void): Promise<ListenerHandle>;
}

export const BackgroundTts = registerPlugin<BackgroundTtsPlugin>("BackgroundTts");
