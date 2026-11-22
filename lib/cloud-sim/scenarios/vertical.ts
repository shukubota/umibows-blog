import type { AnyCloudSim } from "../types";
import { cumulusSim } from "./vertical-cumulus";
import { cumulonimbusSim } from "./vertical-cumulonimbus";

// 対流雲（積雲・積乱雲）。2つとも vertical-parcel.ts のエントレインメント付き空気塊モデルを使う。
export const verticalSims: AnyCloudSim[] = [cumulusSim, cumulonimbusSim];
