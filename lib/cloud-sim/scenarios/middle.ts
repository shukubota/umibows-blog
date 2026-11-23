import type { AnyCloudSim } from "../types";
import { altocumulusSim } from "./middle-altocumulus";
import { altostratusSim } from "./middle-altostratus";
import { nimbostratusSim } from "./middle-nimbostratus";

// 中層雲（高積雲・高層雲・乱層雲）のでき方シミュレーション
export const middleSims: AnyCloudSim[] = [altocumulusSim, altostratusSim, nimbostratusSim];
