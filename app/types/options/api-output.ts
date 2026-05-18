import { z } from "zod"
import { WriterNodeFormat } from "~/types/enums.ts"

export interface PureApiOutputNodeOptions {
  format: WriterNodeFormat
}

export const apiOutputOptionsSchema = z.object({
  format: z.nativeEnum(WriterNodeFormat).default(WriterNodeFormat.JPEG),
})

export type ApiOutputNodeOptions = z.infer<typeof apiOutputOptionsSchema>
