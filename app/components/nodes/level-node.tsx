import {useContext} from "react"
import {NodesContext, NodesDispatchContext} from "~/context/contexts.ts"
import {NumberInput} from "~/components/ui"
import type {LevelNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions.ts"
import {Checkbox} from "~/components/ui/checkbox.tsx"
import {Label} from "~/components/ui/label.tsx"

export function LevelNodeBody({id}: { id: number }) {
    const nodes = useContext(NodesContext)
    const node = nodes.find((n) => n.id === id)
    if (!node) {
        return null
    }
    const options = node.options as LevelNodeOptions
    const dispatch = useContext(NodesDispatchContext)
    const changeValue = (newOptions: Partial<LevelNodeOptions>) => {
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
            <div className="flex items-center space-x-2">
                <Checkbox
                    checked={!!options.skip_on_color}
                    onCheckedChange={(value) => {
                        changeValue({skip_on_color: !!value})
                    }}
                />
                <Label>skip on color</Label>
            </div>
            <NumberInput
                min={0}
                max={255}
                step={1}
                labelText="In White"
                value={options.low_input}
                onChange={(value) => {
                    changeValue({low_input: Math.trunc(value)})
                }}
            />
            <NumberInput
                min={0}
                max={255}
                step={1}
                labelText="In Black"
                value={options.high_input}
                onChange={(value) => {
                    changeValue({high_input: Math.trunc(value)})
                }}
            />
            <NumberInput
                min={0}
                max={255}
                step={1}
                labelText="Out White"
                value={options.low_output}
                onChange={(value) => {
                    changeValue({low_output: Math.trunc(value)})
                }}
            />
            <NumberInput
                min={0}
                max={255}
                step={1}
                labelText="Out Black"
                value={options.high_output}
                onChange={(value) => {
                    changeValue({high_output: Math.trunc(value)})
                }}
            />
            <NumberInput
                min={0}
                max={10}
                step={0.1}
                labelText="Gamma"
                value={options.gamma}
                onChange={(value) => {
                    changeValue({gamma: value})
                }}
            />
        </div>
    )
}
