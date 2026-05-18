import { useContext } from "react"
import { NodesContext, NodesDispatchContext } from "~/context/contexts.ts"
import { NodesActionType } from "~/types/actions.ts"
import { WriterNodeFormat } from "~/types/enums.ts"
import type { ApiOutputNodeOptions } from "~/types/options"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select"

export function ApiOutputNodeBody({ id }: { id: number }) {
    const nodes = useContext(NodesContext)
    const node = nodes.find((n) => n.id === id)
    if (!node) return null
    const options = node.options as ApiOutputNodeOptions
    const dispatch = useContext(NodesDispatchContext)
    const changeValue = (newOptions: Partial<ApiOutputNodeOptions>) => {
        dispatch({
            type: NodesActionType.CHANGE,
            payload: {
                ...node,
                options: {
                    ...options,
                    ...newOptions,
                },
            },
        })
    }

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
                API service responses will use the image state at this point ({options.format} format). Batch pipeline mode passes this node through.
            </p>
            <div>
                <Label>Format</Label>
                <Select
                    onValueChange={(value) => changeValue({format: value as WriterNodeFormat})}
                    value={options.format}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(WriterNodeFormat).map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
