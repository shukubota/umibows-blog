import type { AnyCloudSim } from "../types";
import { cirrusSim } from "./high-cirrus";
import { cirrocumulusSim } from "./high-cirrocumulus";
import { cirrostratusSim } from "./high-cirrostratus";

// 上層雲（巻雲・巻積雲・巻層雲）のでき方シミュレーション
export const highSims: AnyCloudSim[] = [cirrusSim, cirrocumulusSim, cirrostratusSim];
