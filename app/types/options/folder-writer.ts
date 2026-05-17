import { z } from "zod"
import { WriterNodeFormat } from "~/types/enums.ts"

export interface PureFolderWriterNodeOptions {
  path: string
  format: WriterNodeFormat
  api_output_path?: string
}

export const folderWriterOptionsSchema = z.object({
  path: z.string(),
  format: z.nativeEnum(WriterNodeFormat),
  api_output_path: z.string().optional(),
})

export type FolderWriterNodeOptions = z.infer<typeof folderWriterOptionsSchema>
