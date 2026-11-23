import type { AnyCloudSim } from "../types";
import { stratocumulusSim } from "./low-stratocumulus";
import { stratusSim } from "./low-stratus";

// 下層雲（層積雲・層雲）のでき方シミュレーション
export const lowSims: AnyCloudSim[] = [stratocumulusSim, stratusSim];
