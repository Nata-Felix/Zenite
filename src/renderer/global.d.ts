import type { OApi } from "../shared/types";

declare global {
  interface Window {
    o: OApi;
  }
}
