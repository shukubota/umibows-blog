import type { CloudId } from "@/lib/clouds/types";
import type { AnyCloudSim } from "./types";
import { highSims } from "./scenarios/high";
import { middleSims } from "./scenarios/middle";
import { lowSims } from "./scenarios/low";
import { verticalSims } from "./scenarios/vertical";

export { defaultParams } from "./types";
export type { AnyCloudSim, CloudSim, Params, Readout, SimParam } from "./types";

/** 層ごとのシミュレーション。各ファイルは自分の層の雲だけを持つ。 */
export const SIMS_BY_LEVEL = {
  high: highSims,
  middle: middleSims,
  low: lowSims,
  vertical: verticalSims,
} as const;

export const SIMS: AnyCloudSim[] = Object.values(SIMS_BY_LEVEL).flat();

export function getSim(id: CloudId): AnyCloudSim | undefined {
  return SIMS.find((s) => s.id === id);
}
