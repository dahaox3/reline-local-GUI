import { z } from "zod"

export interface PureApiOutputNodeOptions {}

export const apiOutputOptionsSchema = z.object({})

export type ApiOutputNodeOptions = z.infer<typeof apiOutputOptionsSchema>
