import {useContext} from "react"
import {NodesContext, NodesDispatchContext} from "~/context/contexts.ts"
import {WriterNodeFormat} from "~/types/enums.ts"
import type {ApiSnapshotNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions.ts"
import {Button} from "../ui/button"
import {Input} from "../ui/input"
import {Label} from "../ui/label"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "../ui/select"
import {FolderOpen} from "lucide-react"

export function ApiSnapshotNodeBody({id}: { id: number }) {
    const nodes = useContext(NodesContext)
    const node = nodes.find((n) => n.id === id)
    if (!node) return null
    const options = node.options as ApiSnapshotNodeOptions
    const dispatch = useContext(NodesDispatchContext)
    const changeValue = (newOptions: Partial<ApiSnapshotNodeOptions>) => {
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
            <p className="text-sm text-muted-foreground">Only active in API service mode. Batch pipeline mode passes this node through.</p>
            <div className="flex flex-col gap-2">
                <Label>Path to folder</Label>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Path/to/folder"
                        value={options.path}
                        onChange={(e) => changeValue({path: e.target.value})}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        title="Select folder"
                        onClick={async () => {
                            try {
                                const folderPath = await window.electronAPI.selectFolderPath()
                                if (folderPath) changeValue({path: folderPath})
                            } catch (err) {
                                console.error("Folder selection cancelled or failed:", err)
                            }
                        }}
                    >
                        <FolderOpen/>
                    </Button>
                </div>
            </div>
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
