import { z } from "zod"
import { ColorDetectMode, DType, TilerType } from "~/types/enums"

export const UpscaleOptionsSchema = z.object({
  is_own_model: z.boolean(),
  model: z.string(),
  dtype: z.nativeEnum(DType),
  tiler: z.nativeEnum(TilerType),
  exact_tiler_size: z.number(),
  allow_cpu_upscale: z.boolean(),
  auto_detect_color: z.boolean(),
  color_model: z.string(),
  gray_model: z.string(),
  color_detect_mode: z.nativeEnum(ColorDetectMode),
})

export type UpscaleNodeOptions = z.infer<typeof UpscaleOptionsSchema>
export type PureUpscaleNodeOptions = Omit<UpscaleNodeOptions, "is_own_model">
